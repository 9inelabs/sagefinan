-- Approved purchase orders can be edited (add items, change quantities or
-- prices). See CLAUDE.md's "Edit approved purchase orders" entry.
--
-- - ADMIN editing an APPROVED order: it stays APPROVED (the admin is the
--   approver), every line must still be priced, and the edit is stamped in
--   amended_by/amended_at so the timeline shows it changed after approval.
-- - Anyone else (the storekeeper) editing an APPROVED order: it goes back
--   to PENDING and needs approving again.
-- - PENDING/REJECTED: unchanged — saving (re)submits as PENDING.
-- - RECEIVED: still locked; its goods are already recorded as a purchase.

alter table purchase_orders
  add column amended_by uuid references profiles(id),
  add column amended_at timestamptz;

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
  v_role user_role;
  v_keep_approval boolean := false;
  v_line jsonb;
  v_no int := 0;
  v_unpriced int;
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
    if v_status = 'RECEIVED' then
      raise exception 'This purchase order has already been received and can no longer be edited.';
    end if;
    select role into v_role from profiles where id = p_user;
    v_keep_approval := v_status = 'APPROVED' and v_role = 'ADMIN';

    if v_keep_approval then
      update purchase_orders
      set order_date = p_order_date,
          supplier_name = nullif(btrim(p_supplier_name), ''),
          notes = nullif(btrim(p_notes), ''),
          amended_by = p_user, amended_at = now(),
          updated_at = now()
      where id = v_id;
    else
      update purchase_orders
      set order_date = p_order_date,
          supplier_name = nullif(btrim(p_supplier_name), ''),
          notes = nullif(btrim(p_notes), ''),
          status = 'PENDING',
          approved_by = null, approved_at = null,
          rejected_by = null, rejected_at = null, rejection_reason = null,
          updated_at = now()
      where id = v_id;
    end if;
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

  -- An order that stays approved must stay fully priced (same rule as
  -- approve_purchase_order); raising here rolls the whole save back.
  if v_keep_approval then
    select count(*) into v_unpriced from purchase_order_lines where purchase_order_id = v_id and amount is null;
    if v_unpriced > 0 then
      raise exception '% item(s) have no price — an approved order needs every price.', v_unpriced;
    end if;
  end if;

  return v_id;
end;
$$;
