-- Any catalogue product the storekeeper purchases goes into the central
-- store's ledger, even one the central store didn't stock before (e.g. only
-- a bar stocked it): post_purchase_batch now adds the central-store
-- assignment first, in the same transaction, so the bottles show up in the
-- central store's balance straight away.
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
      insert into product_assignments (department_id, product_id)
      values (v_central_id, (v_line->>'product_id')::uuid)
      on conflict (department_id, product_id) do nothing;

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
