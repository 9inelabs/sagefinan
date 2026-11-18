-- Purchases of items the system doesn't track, and purchase orders that can
-- be submitted with prices/quantities still to be filled in by the approver.
-- See CLAUDE.md's "Unstocked purchase items, PO pricing by the approver…" entry.

-- ---------------------------------------------------------------------------
-- 1. Unstocked purchase lines
-- ---------------------------------------------------------------------------
-- Things bought and sent straight to whoever uses them (goat meat, diesel…):
-- recorded on the purchase receipt for reference, never stock, never a
-- product. They share the purchase's grouping (business day + person, and
-- the PO when received from one) so they appear on the same receipt as any
-- stock lines bought alongside them. Read-only RLS like every table; writes
-- only through post_purchase_batch().
create table purchase_unstocked_lines (
  id uuid primary key default gen_random_uuid(),
  business_day date not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  supplier_name text,
  invoice_reference text,
  purchase_order_id uuid references purchase_orders(id),
  description text not null check (btrim(description) <> ''),
  quantity_text text,
  amount numeric(14, 2) not null check (amount >= 0)
);

create index purchase_unstocked_lines_day_idx on purchase_unstocked_lines (business_day, created_by);
alter table purchase_unstocked_lines enable row level security;
create policy purchase_unstocked_lines_select on purchase_unstocked_lines for select
  using (app_current_role() in ('ADMIN', 'AUDITOR', 'STOREKEEPER'));

-- A batch line with a product_id is a stock purchase into the central store
-- (as before); one without is an unstocked line (description + free-text
-- quantity + amount). A batch may be all one kind or mixed.
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
    raise exception 'A purchase needs at least one line.';
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
    if nullif(v_line->>'product_id', '') is not null then
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
    else
      insert into purchase_unstocked_lines (
        business_day, created_by, supplier_name, invoice_reference, purchase_order_id,
        description, quantity_text, amount
      )
      values (
        p_business_day, p_created_by, nullif(p_supplier_name, ''), nullif(p_invoice_reference, ''), p_purchase_order_id,
        btrim(v_line->>'description'), nullif(btrim(v_line->>'quantity_text'), ''), (v_line->>'amount')::numeric
      )
      returning id into v_id;
    end if;
    return next v_id;
  end loop;

  if p_purchase_order_id is not null then
    update purchase_orders set status = 'RECEIVED', received_at = now(), updated_at = now()
    where id = p_purchase_order_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Purchase orders: prices may be left for the approver
-- ---------------------------------------------------------------------------
alter table purchase_order_lines alter column amount drop not null;

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
      nullif(v_line->>'amount', '')::numeric, nullif(v_line->>'product_id', '')::uuid
    );
  end loop;

  return v_id;
end;
$$;

-- Approval is refused while any line is unpriced — the approved order (and
-- its PDF) always carries a complete total. Quantities may stay blank, as
-- on the paper order.
create or replace function approve_purchase_order(p_id uuid, p_user uuid)
returns void
language plpgsql
as $$
declare
  v_status purchase_order_status;
  v_unpriced int;
begin
  select status into v_status from purchase_orders where id = p_id for update;
  if not found then
    raise exception 'Purchase order not found.';
  end if;
  if v_status <> 'PENDING' then
    raise exception 'Only a pending purchase order can be approved — it may already have been actioned.';
  end if;
  select count(*) into v_unpriced from purchase_order_lines where purchase_order_id = p_id and amount is null;
  if v_unpriced > 0 then
    raise exception '% item(s) still have no price — add every price before approving.', v_unpriced;
  end if;
  update purchase_orders
  set status = 'APPROVED', approved_by = p_user, approved_at = now(), updated_at = now()
  where id = p_id;
end;
$$;
