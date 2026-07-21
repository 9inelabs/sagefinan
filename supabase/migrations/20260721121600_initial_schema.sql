-- Sagefinan — initial schema
-- Covers the whole system per SPEC.md so later phases don't restructure it.
-- Movements are the single source of truth: there is no stored "current quantity"
-- column anywhere. Stock levels are always computed by summing movements
-- (see the get_department_balance function in the next migration).

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_role as enum ('ADMIN', 'STOREKEEPER', 'DEPARTMENT_USER', 'AUDITOR');

create type movement_type as enum ('PURCHASE', 'REQUISITION', 'SALE');

create type session_status as enum ('DRAFT', 'COMPLETED', 'LOCKED');

create type reason_code as enum (
  'BREAKAGE',
  'SPILLAGE',
  'UNRECORDED_SALE',
  'TRANSFER_NOT_POSTED',
  'POSTING_ERROR',
  'UNDER_INVESTIGATION'
);

-- ============================================================================
-- DEPARTMENTS
-- ============================================================================

create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_central_store boolean not null default false,
  is_active boolean not null default true
);

-- At most one department may be flagged as the central store.
create unique index one_central_store_only on departments (is_central_store) where is_central_store;

-- ============================================================================
-- PROFILES (one row per auth.users row)
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null,
  department_id uuid references departments (id),
  is_active boolean not null default true,
  -- Auditor and admin see all departments; storekeeper and department_user
  -- are scoped to exactly one department, so they must have one assigned.
  constraint department_required_for_scoped_roles check (
    (role in ('STOREKEEPER', 'DEPARTMENT_USER') and department_id is not null)
    or (role in ('ADMIN', 'AUDITOR'))
  )
);

create index profiles_department_id_idx on profiles (department_id);

-- ============================================================================
-- PRODUCTS
-- ============================================================================

create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  is_active boolean not null default true
);

-- ============================================================================
-- PRODUCT ASSIGNMENTS (which departments stock which products, and shelf order)
-- ============================================================================

create table product_assignments (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  product_id uuid not null references products (id),
  shelf_order integer,
  unique (department_id, product_id)
);

create index product_assignments_product_id_idx on product_assignments (product_id);

-- ============================================================================
-- MOVEMENTS (single source of truth — immutable ledger, never updated/deleted)
-- ============================================================================

create table movements (
  id uuid primary key default gen_random_uuid(),
  business_day date not null default current_date,
  type movement_type not null,
  product_id uuid not null references products (id),
  from_department_id uuid references departments (id),
  to_department_id uuid references departments (id),
  quantity integer not null check (quantity > 0),
  note text,
  created_by uuid not null references profiles (id),
  received_by uuid references profiles (id),
  created_at timestamptz not null default now(),

  -- The requisition two-sided rule: a REQUISITION carries both sides on one
  -- row, so the two departments can never drift apart. PURCHASE only has a
  -- destination (the supplier isn't a department). SALE only has a source.
  constraint movement_department_shape check (
    (type = 'PURCHASE' and from_department_id is null and to_department_id is not null)
    or (type = 'REQUISITION' and from_department_id is not null and to_department_id is not null and from_department_id <> to_department_id)
    or (type = 'SALE' and from_department_id is not null and to_department_id is null)
  )
);

create index movements_business_day_idx on movements (business_day);
create index movements_product_business_day_idx on movements (product_id, business_day);
create index movements_from_department_id_idx on movements (from_department_id);
create index movements_to_department_id_idx on movements (to_department_id);

-- The two-sided CHECK above only constrains null-ness/inequality, since CHECK
-- constraints can't look up another table's is_central_store flag. This trigger
-- enforces the actual accounting rule: purchases only ever land in the central
-- store, requisitions only ever move central store -> non-central department,
-- and sales only ever happen out of a non-central department.
create function validate_movement() returns trigger
language plpgsql
as $$
declare
  from_is_central boolean;
  to_is_central boolean;
begin
  if new.from_department_id is not null then
    select is_central_store into from_is_central from departments where id = new.from_department_id;
  end if;
  if new.to_department_id is not null then
    select is_central_store into to_is_central from departments where id = new.to_department_id;
  end if;

  if new.type = 'PURCHASE' and not to_is_central then
    raise exception 'PURCHASE movements must land in the central store department';
  end if;

  if new.type = 'REQUISITION' and (not from_is_central or to_is_central) then
    raise exception 'REQUISITION movements must go from the central store to a non-central department';
  end if;

  if new.type = 'SALE' and from_is_central then
    raise exception 'SALE movements cannot be recorded against the central store';
  end if;

  return new;
end;
$$;

create trigger validate_movement_trigger
  before insert or update on movements
  for each row execute function validate_movement();

-- ============================================================================
-- COUNT SESSIONS
-- ============================================================================

create table count_sessions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  as_at_date date not null,
  counted_by uuid not null references profiles (id),
  status session_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (department_id, as_at_date)
);

create index count_sessions_department_id_idx on count_sessions (department_id);

-- ============================================================================
-- COUNT LINES
-- ============================================================================

create table count_lines (
  id uuid primary key default gen_random_uuid(),
  count_session_id uuid not null references count_sessions (id) on delete cascade,
  product_id uuid not null references products (id),
  expected_qty integer not null default 0 check (expected_qty >= 0),
  physical_qty integer check (physical_qty >= 0),
  ledger_qty integer check (ledger_qty >= 0),
  -- Variance is physical vs. expected (the figure captured while counting,
  -- hidden from the auditor until they finish) — not vs. ledger, which may be
  -- recomputed later and simply reveals a posting-timing discrepancy instead.
  variance integer generated always as (physical_qty - expected_qty) stored,
  reason_code reason_code,
  note text,
  unique (count_session_id, product_id)
);

create index count_lines_count_session_id_idx on count_lines (count_session_id);
create index count_lines_product_id_idx on count_lines (product_id);

-- ============================================================================
-- ADJUSTMENTS (audit trail for any correction made after a session is locked)
-- ============================================================================

create table adjustments (
  id uuid primary key default gen_random_uuid(),
  count_line_id uuid not null references count_lines (id),
  previous_qty integer not null,
  new_qty integer not null,
  reason text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create index adjustments_count_line_id_idx on adjustments (count_line_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- All real access happens server-side via Server Actions using the service
-- role key (which bypasses RLS). These policies are defence in depth in case
-- the anon/authenticated key is ever used directly against the database.

-- Helper functions to read the calling user's own role/department without
-- re-triggering RLS on profiles (SECURITY DEFINER, owned by postgres).
create function app_current_role() returns user_role
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create function app_current_department_id() returns uuid
language sql security definer stable set search_path = public as $$
  select department_id from profiles where id = auth.uid();
$$;

alter table profiles enable row level security;
alter table departments enable row level security;
alter table products enable row level security;
alter table product_assignments enable row level security;
alter table movements enable row level security;
alter table count_sessions enable row level security;
alter table count_lines enable row level security;
alter table adjustments enable row level security;

-- profiles: everyone can read their own row; admins can read/write everyone's.
create policy profiles_select on profiles for select
  using (id = auth.uid() or app_current_role() = 'ADMIN');
create policy profiles_insert on profiles for insert
  with check (app_current_role() = 'ADMIN');
create policy profiles_update on profiles for update
  using (app_current_role() = 'ADMIN');
create policy profiles_delete on profiles for delete
  using (app_current_role() = 'ADMIN');

-- departments: admin/auditor see all; storekeeper/department_user see their own.
create policy departments_select on departments for select
  using (app_current_role() in ('ADMIN', 'AUDITOR') or id = app_current_department_id());
create policy departments_insert on departments for insert
  with check (app_current_role() = 'ADMIN');
create policy departments_update on departments for update
  using (app_current_role() = 'ADMIN');
create policy departments_delete on departments for delete
  using (app_current_role() = 'ADMIN');

-- products: any authenticated user may read the product master; only admin writes.
create policy products_select on products for select
  using (auth.uid() is not null);
create policy products_insert on products for insert
  with check (app_current_role() = 'ADMIN');
create policy products_update on products for update
  using (app_current_role() = 'ADMIN');
create policy products_delete on products for delete
  using (app_current_role() = 'ADMIN');

-- product_assignments: admin/auditor see all; others see only their own department's.
create policy product_assignments_select on product_assignments for select
  using (app_current_role() in ('ADMIN', 'AUDITOR') or department_id = app_current_department_id());
create policy product_assignments_insert on product_assignments for insert
  with check (app_current_role() = 'ADMIN');
create policy product_assignments_update on product_assignments for update
  using (app_current_role() = 'ADMIN');
create policy product_assignments_delete on product_assignments for delete
  using (app_current_role() = 'ADMIN');

-- movements: admin/auditor see all; others see only movements touching their
-- own department. Movements are an immutable ledger: no update/delete policy
-- is defined for anyone, so those actions are denied by default under RLS.
create policy movements_select on movements for select
  using (
    app_current_role() in ('ADMIN', 'AUDITOR')
    or from_department_id = app_current_department_id()
    or to_department_id = app_current_department_id()
  );
create policy movements_insert on movements for insert
  with check (
    (app_current_role() = 'STOREKEEPER' and type in ('PURCHASE', 'REQUISITION'))
    or (app_current_role() = 'DEPARTMENT_USER' and type = 'SALE' and from_department_id = app_current_department_id())
    or app_current_role() = 'ADMIN'
  );

-- count_sessions: admin/auditor see and manage all; others see only their own department's.
create policy count_sessions_select on count_sessions for select
  using (app_current_role() in ('ADMIN', 'AUDITOR') or department_id = app_current_department_id());
create policy count_sessions_insert on count_sessions for insert
  with check (app_current_role() in ('ADMIN', 'AUDITOR'));
create policy count_sessions_update on count_sessions for update
  using (app_current_role() in ('ADMIN', 'AUDITOR'));

-- count_lines: visibility follows the parent session's department.
create policy count_lines_select on count_lines for select
  using (
    app_current_role() in ('ADMIN', 'AUDITOR')
    or exists (
      select 1 from count_sessions cs
      where cs.id = count_lines.count_session_id
      and cs.department_id = app_current_department_id()
    )
  );
create policy count_lines_insert on count_lines for insert
  with check (app_current_role() in ('ADMIN', 'AUDITOR'));
create policy count_lines_update on count_lines for update
  using (app_current_role() in ('ADMIN', 'AUDITOR'));

-- adjustments: admin/auditor only — this is the audit trail for locked-session corrections.
create policy adjustments_select on adjustments for select
  using (app_current_role() in ('ADMIN', 'AUDITOR'));
create policy adjustments_insert on adjustments for insert
  with check (app_current_role() in ('ADMIN', 'AUDITOR'));
