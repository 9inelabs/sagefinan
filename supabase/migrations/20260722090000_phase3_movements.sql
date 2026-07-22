-- Sagefinan — phase 3: purchases, requisitions, reversals, business-day locking
--
-- No new tables. Adds to movements:
--   - supplier_name / invoice_reference (PURCHASE-only context, SPEC.md)
--   - is_override / override_reason (insufficient-stock override on REQUISITION,
--     flagged for auditor attention)
--   - reversal_of_movement_id (set once at insert on the reversal row, never
--     updated afterwards — see the note below on why there is no
--     reversed_by_movement_id column)
--
-- Reversal model: a reversal is a normal movement row with the SAME type,
-- product_id, from_department_id and to_department_id as the movement it
-- reverses (so it satisfies the existing movement_department_shape check and
-- validate_movement trigger unchanged), tagged reversal_of_movement_id. Its
-- "opposite effect" is achieved in get_department_balance, which now nets a
-- reversal's quantity as negative in the same inbound/outbound branch its
-- original counted in — so a REQUISITION reversal (from central, to dept)
-- restores central store's balance up and the destination's balance down in
-- one row, exactly cancelling the original, and a PURCHASE reversal nets the
-- central store's inbound down. This deliberately avoids flipping
-- from/to_department_id on the reversal row, which would fight
-- validate_movement's "requisitions only ever go central -> non-central"
-- rule for no benefit.
--
-- "reversed_by_movement_id" is NOT a stored column: movements are immutable
-- (no UPDATE policy exists for anyone, by design — see CLAUDE.md), so the
-- original row is never touched when it's reversed. Whether a movement has
-- been reversed, and by which row, is instead derived by looking for a row
-- whose reversal_of_movement_id points back at it (see the
-- movements_detail view below) — an "equivalent link" per SPEC.md's phrasing,
-- traceable in both directions via ordinary queries, with zero risk of ever
-- violating immutability.
--
-- Business-day locking: a single trigger (check_business_day_lock) on
-- movements applies to every insert — purchases, requisitions, and reversals
-- alike, plus sales when phase 4 adds that movement type — so the rule lives
-- in exactly one place rather than being re-implemented per posting action.

-- ============================================================================
-- MOVEMENTS: new columns
-- ============================================================================

alter table movements
  add column supplier_name text,
  add column invoice_reference text,
  add column is_override boolean not null default false,
  add column override_reason text,
  add column reversal_of_movement_id uuid references movements (id);

alter table movements
  add constraint movement_override_reason_required
    check (not is_override or override_reason is not null);

alter table movements
  add constraint movement_reversal_not_self
    check (reversal_of_movement_id is null or reversal_of_movement_id <> id);

create index movements_reversal_of_movement_id_idx on movements (reversal_of_movement_id);

comment on column movements.reversal_of_movement_id is
  'Set once at insert if this row reverses an earlier movement. Never updated. The reverse direction (was this movement reversed, and by what) is derived, not stored — see migration header.';

-- ============================================================================
-- BUSINESS-DAY LOCKING
-- ============================================================================
-- "If a count session for a department already exists with status LOCKED for
-- a given business day, no new movements — including reversals — may be
-- posted for that department on or before that date." (SPEC.md)

create function check_business_day_lock() returns trigger
language plpgsql
as $$
declare
  v_locked record;
begin
  select cs.as_at_date, d.name as department_name
  into v_locked
  from count_sessions cs
  join departments d on d.id = cs.department_id
  where cs.status = 'LOCKED'
    and cs.as_at_date >= new.business_day
    and (cs.department_id = new.from_department_id or cs.department_id = new.to_department_id)
  order by cs.as_at_date asc
  limit 1;

  if found then
    raise exception 'Business day % is locked for % — a count session was locked certifying figures as at %. Post this on a later business day instead.',
      to_char(new.business_day, 'DD Mon YYYY'), v_locked.department_name, to_char(v_locked.as_at_date, 'DD Mon YYYY');
  end if;

  return new;
end;
$$;

create trigger check_business_day_lock_trigger
  before insert on movements
  for each row execute function check_business_day_lock();

-- ============================================================================
-- BALANCE FUNCTION: net out reversals (opposite effect, same business day)
-- ============================================================================

create or replace function get_department_balance(p_department_id uuid, p_as_at_date date)
returns table (
  product_id uuid,
  product_code text,
  product_name text,
  unit_cost numeric,
  opening_qty integer,
  received_qty integer,
  issued_qty integer,
  closing_qty integer,
  opening_value numeric,
  received_value numeric,
  issued_value numeric,
  closing_value numeric
)
language sql
stable
as $$
  with assigned_products as (
    select p.id as product_id, p.code as product_code, p.name as product_name, p.unit_cost
    from product_assignments pa
    join products p on p.id = pa.product_id
    where pa.department_id = p_department_id
    and p.is_active
  ),
  inbound as (
    select
      m.product_id,
      sum(case when m.reversal_of_movement_id is not null then -m.quantity else m.quantity end)
        filter (where m.business_day < p_as_at_date) as pre_qty,
      sum(case when m.reversal_of_movement_id is not null then -m.quantity else m.quantity end)
        filter (where m.business_day = p_as_at_date) as day_qty
    from movements m
    where m.to_department_id = p_department_id
    and m.business_day <= p_as_at_date
    group by m.product_id
  ),
  outbound as (
    select
      m.product_id,
      sum(case when m.reversal_of_movement_id is not null then -m.quantity else m.quantity end)
        filter (where m.business_day < p_as_at_date) as pre_qty,
      sum(case when m.reversal_of_movement_id is not null then -m.quantity else m.quantity end)
        filter (where m.business_day = p_as_at_date) as day_qty
    from movements m
    where m.from_department_id = p_department_id
    and m.business_day <= p_as_at_date
    group by m.product_id
  )
  select
    ap.product_id,
    ap.product_code,
    ap.product_name,
    ap.unit_cost,
    (coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0))::int as opening_qty,
    coalesce(i.day_qty, 0)::int as received_qty,
    coalesce(o.day_qty, 0)::int as issued_qty,
    (coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0) + coalesce(i.day_qty, 0) - coalesce(o.day_qty, 0))::int as closing_qty,
    (coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0)) * ap.unit_cost as opening_value,
    coalesce(i.day_qty, 0) * ap.unit_cost as received_value,
    coalesce(o.day_qty, 0) * ap.unit_cost as issued_value,
    (coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0) + coalesce(i.day_qty, 0) - coalesce(o.day_qty, 0)) * ap.unit_cost as closing_value
  from assigned_products ap
  left join inbound i on i.product_id = ap.product_id
  left join outbound o on o.product_id = ap.product_id
  order by ap.product_name;
$$;

comment on function get_department_balance(uuid, date) is
  'Opening/received/issued/closing quantity and value per product for a department as at close of business on a given date, computed by summing movements (reversals net out at their original business_day). Single source of truth for stock levels — see SPEC.md.';

-- ============================================================================
-- BATCH POSTING RPCS — each call is one transaction: all lines or none.
-- ============================================================================

create function post_purchase_batch(
  p_business_day date,
  p_supplier_name text,
  p_invoice_reference text,
  p_created_by uuid,
  p_lines jsonb -- [{product_id, quantity}]
) returns setof uuid
language plpgsql
as $$
declare
  v_central_id uuid;
  v_line jsonb;
  v_id uuid;
begin
  select id into v_central_id from departments where is_central_store;
  if v_central_id is null then
    raise exception 'No department is flagged as the central store.';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'A purchase batch needs at least one line.';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into movements (
      business_day, type, product_id, to_department_id, quantity,
      supplier_name, invoice_reference, created_by
    )
    values (
      p_business_day, 'PURCHASE', (v_line->>'product_id')::uuid, v_central_id,
      (v_line->>'quantity')::int, nullif(p_supplier_name, ''), nullif(p_invoice_reference, ''), p_created_by
    )
    returning id into v_id;
    return next v_id;
  end loop;
end;
$$;

create function post_requisition_batch(
  p_business_day date,
  p_to_department_id uuid,
  p_received_by uuid,
  p_created_by uuid,
  p_lines jsonb -- [{product_id, quantity, is_override, override_reason}]
) returns setof uuid
language plpgsql
as $$
declare
  v_central_id uuid;
  v_line jsonb;
  v_id uuid;
  v_product_id uuid;
  v_quantity int;
  v_is_override boolean;
  v_override_reason text;
  v_available int;
begin
  select id into v_central_id from departments where is_central_store;
  if v_central_id is null then
    raise exception 'No department is flagged as the central store.';
  end if;

  if p_to_department_id = v_central_id then
    raise exception 'Requisitions cannot target the central store.';
  end if;

  if p_received_by is null then
    raise exception 'Received by is required.';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'A requisition batch needs at least one line.';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_quantity := (v_line->>'quantity')::int;
    v_is_override := coalesce((v_line->>'is_override')::boolean, false);
    v_override_reason := nullif(v_line->>'override_reason', '');

    if v_is_override and v_override_reason is null then
      raise exception 'An override reason is required for product %.', v_product_id;
    end if;

    select closing_qty into v_available
    from get_department_balance(v_central_id, p_business_day)
    where product_id = v_product_id;

    v_available := coalesce(v_available, 0);

    if v_quantity > v_available and not v_is_override then
      raise exception 'Central store only holds % bottles of this product as at % — % requested. Use the override to proceed anyway.',
        v_available, to_char(p_business_day, 'DD Mon YYYY'), v_quantity;
    end if;

    insert into movements (
      business_day, type, product_id, from_department_id, to_department_id,
      quantity, received_by, is_override, override_reason, created_by
    )
    values (
      p_business_day, 'REQUISITION', v_product_id, v_central_id, p_to_department_id,
      v_quantity, p_received_by, v_is_override, v_override_reason, p_created_by
    )
    returning id into v_id;
    return next v_id;
  end loop;
end;
$$;

create function post_movement_reversal(
  p_movement_id uuid,
  p_reason text,
  p_created_by uuid
) returns uuid
language plpgsql
as $$
declare
  v_original movements%rowtype;
  v_already_reversed boolean;
  v_new_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reverse a movement.';
  end if;

  select * into v_original from movements where id = p_movement_id;
  if not found then
    raise exception 'Movement not found.';
  end if;

  if v_original.reversal_of_movement_id is not null then
    raise exception 'This is itself a reversal and cannot be reversed here — reverse the original movement instead.';
  end if;

  select exists(select 1 from movements where reversal_of_movement_id = p_movement_id) into v_already_reversed;
  if v_already_reversed then
    raise exception 'This movement has already been reversed.';
  end if;

  insert into movements (
    business_day, type, product_id, from_department_id, to_department_id,
    quantity, note, received_by, created_by, reversal_of_movement_id
  )
  values (
    v_original.business_day, v_original.type, v_original.product_id,
    v_original.from_department_id, v_original.to_department_id,
    v_original.quantity, btrim(p_reason), v_original.received_by, p_created_by, v_original.id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function post_purchase_batch(date, text, text, uuid, jsonb) to service_role;
grant execute on function post_requisition_batch(date, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function post_movement_reversal(uuid, text, uuid) to service_role;

-- ============================================================================
-- MOVEMENTS DETAIL VIEW — the movements list/detail/CSV screen's single
-- source query. All real access is via the service-role admin client
-- (bypasses RLS regardless, per lib/supabase/admin.ts), so this view carries
-- no RLS of its own — same trust boundary as every other admin-client query
-- in the app.
-- ============================================================================

create view movements_detail as
select
  m.id,
  m.business_day,
  m.created_at,
  m.type,
  m.product_id,
  p.code as product_code,
  p.name as product_name,
  m.from_department_id,
  fd.name as from_department_name,
  m.to_department_id,
  td.name as to_department_name,
  m.quantity,
  m.note,
  m.supplier_name,
  m.invoice_reference,
  m.is_override,
  m.override_reason,
  m.created_by,
  cb.full_name as created_by_name,
  m.received_by,
  rb.full_name as received_by_name,
  m.reversal_of_movement_id,
  rev.id as reversed_by_movement_id
from movements m
join products p on p.id = m.product_id
left join departments fd on fd.id = m.from_department_id
left join departments td on td.id = m.to_department_id
join profiles cb on cb.id = m.created_by
left join profiles rb on rb.id = m.received_by
left join movements rev on rev.reversal_of_movement_id = m.id;

grant select on movements_detail to service_role;

comment on view movements_detail is
  'Denormalized read model for the movements list/detail/CSV screens. reversed_by_movement_id is derived (a reverse lookup on reversal_of_movement_id), not stored, since movements are never updated once posted.';
