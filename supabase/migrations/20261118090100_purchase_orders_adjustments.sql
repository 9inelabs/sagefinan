-- Purchase amounts, stock adjustments and purchase orders.
-- See CLAUDE.md's "Purchase amounts, purchase orders, adjustments, reports"
-- entry for the reasoning behind each piece.

-- ---------------------------------------------------------------------------
-- 1. Purchase orders
-- ---------------------------------------------------------------------------
create type purchase_order_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'RECEIVED');

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number bigint generated always as identity unique,
  order_date date not null,
  supplier_name text,
  notes text,
  status purchase_order_status not null default 'PENDING',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  rejected_by uuid references profiles(id),
  rejected_at timestamptz,
  rejection_reason text,
  received_at timestamptz
);

-- A line is free text (the hotel orders plenty that is never stock — Ugu,
-- diesel, knives), with an optional link to a catalogue product. Only linked
-- lines carry into the stock receipt when goods arrive. Quantity is free text
-- ("5 paints", "1/2 bag") exactly as on the paper PO; amount is the line total.
create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  line_no int not null,
  description text not null check (btrim(description) <> ''),
  quantity_text text,
  amount numeric(14, 2) not null check (amount >= 0),
  product_id uuid references products(id),
  unique (purchase_order_id, line_no)
);

create index purchase_orders_status_idx on purchase_orders (status, order_date desc);
create index purchase_order_lines_po_idx on purchase_order_lines (purchase_order_id);

alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;

-- Read-only RLS like every other table; all writes go through the
-- service-role client after an application-code role check.
create policy purchase_orders_select on purchase_orders for select
  using (app_current_role() in ('ADMIN', 'AUDITOR', 'STOREKEEPER'));
create policy purchase_order_lines_select on purchase_order_lines for select
  using (app_current_role() in ('ADMIN', 'AUDITOR', 'STOREKEEPER'));

-- Create or (while PENDING/REJECTED) replace a PO and all its lines in one
-- transaction. Editing a rejected PO resubmits it as PENDING.
create or replace function save_purchase_order(
  p_id uuid,
  p_order_date date,
  p_supplier_name text,
  p_notes text,
  p_user uuid,
  p_lines jsonb
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := p_id;
  v_status purchase_order_status;
  v_line jsonb;
  v_no int := 0;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'A purchase order needs at least one item.';
  end if;

  if v_id is null then
    insert into purchase_orders (order_date, supplier_name, notes, created_by)
    values (p_order_date, nullif(btrim(p_supplier_name), ''), nullif(btrim(p_notes), ''), p_user)
    returning id into v_id;
  else
    select status into v_status from purchase_orders where id = v_id for update;
    if not found then
      raise exception 'Purchase order not found.';
    end if;
    if v_status not in ('PENDING', 'REJECTED') then
      raise exception 'Only a pending or rejected purchase order can be edited.';
    end if;
    update purchase_orders
    set order_date = p_order_date,
        supplier_name = nullif(btrim(p_supplier_name), ''),
        notes = nullif(btrim(p_notes), ''),
        status = 'PENDING',
        rejected_by = null, rejected_at = null, rejection_reason = null,
        updated_at = now()
    where id = v_id;
    delete from purchase_order_lines where purchase_order_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_no := v_no + 1;
    insert into purchase_order_lines (purchase_order_id, line_no, description, quantity_text, amount, product_id)
    values (
      v_id, v_no, btrim(v_line->>'description'), nullif(btrim(v_line->>'quantity_text'), ''),
      (v_line->>'amount')::numeric, nullif(v_line->>'product_id', '')::uuid
    );
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Movement columns: purchase amount, PO link, adjustment category
-- ---------------------------------------------------------------------------
alter table movements
  add column amount numeric(14, 2) check (amount is null or amount >= 0),
  add column purchase_order_id uuid references purchase_orders(id),
  add column adjustment_category text;

create index movements_purchase_order_idx on movements (purchase_order_id) where purchase_order_id is not null;

-- ADJUSTMENT is one-sided: an increase lands in to_department_id, a decrease
-- leaves from_department_id. get_department_balance already treats every
-- to-side non-OPENING movement as received and every from-side movement as
-- issued, so adjustments flow into the ledger with no change to it.
alter table movements drop constraint movement_department_shape;
alter table movements add constraint movement_department_shape check (
  (type = 'PURCHASE' and from_department_id is null and to_department_id is not null)
  or (type = 'OPENING' and from_department_id is null and to_department_id is not null)
  or (type = 'REQUISITION' and from_department_id is not null and to_department_id is not null and from_department_id <> to_department_id)
  or (type = 'SALE' and from_department_id is not null and to_department_id is null)
  or (type = 'ADJUSTMENT' and ((from_department_id is null) <> (to_department_id is null)))
);
alter table movements add constraint movement_adjustment_category_required
  check (type <> 'ADJUSTMENT' or reversal_of_movement_id is not null or adjustment_category is not null);

-- ---------------------------------------------------------------------------
-- 3. Purchases: amount per line, optional PO link (marks the PO received)
-- ---------------------------------------------------------------------------
drop function if exists post_purchase_batch(date, text, text, uuid, jsonb);

create or replace function post_purchase_batch(
  p_business_day date,
  p_supplier_name text,
  p_invoice_reference text,
  p_created_by uuid,
  p_lines jsonb,
  p_purchase_order_id uuid default null
) returns setof uuid
language plpgsql
as $$
declare
  v_central_id uuid;
  v_line jsonb;
  v_id uuid;
  v_po_status purchase_order_status;
begin
  select id into v_central_id from departments where is_central_store;
  if v_central_id is null then
    raise exception 'No department is flagged as the central store.';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'A purchase batch needs at least one line.';
  end if;

  if p_purchase_order_id is not null then
    select status into v_po_status from purchase_orders where id = p_purchase_order_id for update;
    if not found then
      raise exception 'Purchase order not found.';
    end if;
    if v_po_status <> 'APPROVED' then
      raise exception 'Only an approved purchase order can be received.';
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into movements (
      business_day, type, product_id, to_department_id, quantity, amount,
      supplier_name, invoice_reference, created_by, purchase_order_id
    )
    values (
      p_business_day, 'PURCHASE', (v_line->>'product_id')::uuid, v_central_id,
      (v_line->>'quantity')::int, nullif(v_line->>'amount', '')::numeric,
      nullif(p_supplier_name, ''), nullif(p_invoice_reference, ''), p_created_by, p_purchase_order_id
    )
    returning id into v_id;
    return next v_id;
  end loop;

  if p_purchase_order_id is not null then
    update purchase_orders set status = 'RECEIVED', received_at = now(), updated_at = now()
    where id = p_purchase_order_id;
  end if;
end;
$$;

-- Reversals now carry the original's amount and adjustment category too, so
-- reports can net a reversed purchase's amount out exactly like its quantity.
create or replace function post_movement_reversal(p_movement_id uuid, p_reason text, p_created_by uuid)
returns uuid
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
    quantity, note, received_by, created_by, reversal_of_movement_id,
    amount, adjustment_category, supplier_name, invoice_reference
  )
  values (
    v_original.business_day, v_original.type, v_original.product_id,
    v_original.from_department_id, v_original.to_department_id,
    v_original.quantity, btrim(p_reason), v_original.received_by, p_created_by, v_original.id,
    v_original.amount, v_original.adjustment_category, v_original.supplier_name, v_original.invoice_reference
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Stock adjustments
-- ---------------------------------------------------------------------------
-- p_delta > 0 adds stock, < 0 removes it. A removal is re-checked against the
-- department's closing balance for that business day so stock can never go
-- negative through an adjustment.
create or replace function post_stock_adjustment(
  p_department_id uuid,
  p_business_day date,
  p_product_id uuid,
  p_delta int,
  p_category text,
  p_note text,
  p_created_by uuid
) returns uuid
language plpgsql
as $$
declare
  v_closing int;
  v_id uuid;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'Enter a quantity to add or remove.';
  end if;
  if p_category is null or btrim(p_category) = '' then
    raise exception 'Choose a reason for this adjustment.';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'Add a note explaining this adjustment.';
  end if;

  select b.closing_qty into v_closing
  from get_department_balance(p_department_id, p_business_day, array[p_product_id]) b;
  if not found then
    raise exception 'This product is not stocked by that department.';
  end if;

  if p_delta < 0 and v_closing + p_delta < 0 then
    raise exception 'Only % in stock as at % — you cannot remove %.', v_closing, to_char(p_business_day, 'DD Mon YYYY'), -p_delta;
  end if;

  insert into movements (
    business_day, type, product_id, from_department_id, to_department_id,
    quantity, adjustment_category, note, created_by
  ) values (
    p_business_day, 'ADJUSTMENT', p_product_id,
    case when p_delta < 0 then p_department_id end,
    case when p_delta > 0 then p_department_id end,
    abs(p_delta), btrim(p_category), btrim(p_note), p_created_by
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. movements_detail: expose the new columns (appended, so CREATE OR
-- REPLACE keeps existing column order valid)
-- ---------------------------------------------------------------------------
create or replace view movements_detail as
select m.id,
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
  rev.id as reversed_by_movement_id,
  m.amount,
  m.purchase_order_id,
  m.adjustment_category,
  p.unit_cost
from movements m
join products p on p.id = m.product_id
left join departments fd on fd.id = m.from_department_id
left join departments td on td.id = m.to_department_id
join profiles cb on cb.id = m.created_by
left join profiles rb on rb.id = m.received_by
left join movements rev on rev.reversal_of_movement_id = m.id;
