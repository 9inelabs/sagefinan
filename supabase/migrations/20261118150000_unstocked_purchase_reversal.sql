-- Reversing a purchase line that isn't stock (purchase_unstocked_lines).
-- Same model as a movement reversal (post_movement_reversal): the original
-- row is never touched or deleted; a new row copying it is appended, tagged
-- reversal_of_id and carrying the reason, and every total nets that row's
-- amount as negative. See CLAUDE.md's "Reverse unstocked purchase items".

alter table purchase_unstocked_lines
  add column reversal_of_id uuid references purchase_unstocked_lines(id),
  add column note text;

-- At most one reversal per line, enforced by the database itself so two
-- concurrent reversals can't both succeed.
create unique index purchase_unstocked_lines_reversal_of_idx
  on purchase_unstocked_lines (reversal_of_id) where reversal_of_id is not null;

create or replace function reverse_unstocked_purchase_line(p_id uuid, p_reason text, p_created_by uuid)
returns uuid
language plpgsql
as $$
declare
  v_original purchase_unstocked_lines%rowtype;
  v_new_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reverse a purchase line.';
  end if;

  select * into v_original from purchase_unstocked_lines where id = p_id for update;
  if not found then
    raise exception 'Purchase line not found.';
  end if;
  if v_original.reversal_of_id is not null then
    raise exception 'This is itself a reversal and cannot be reversed — the original line stays reversed.';
  end if;
  if exists (select 1 from purchase_unstocked_lines where reversal_of_id = p_id) then
    raise exception 'This purchase line has already been reversed.';
  end if;

  insert into purchase_unstocked_lines (
    business_day, created_by, supplier_name, invoice_reference, purchase_order_id,
    description, quantity_text, amount, reversal_of_id, note
  ) values (
    v_original.business_day, p_created_by, v_original.supplier_name, v_original.invoice_reference,
    v_original.purchase_order_id, v_original.description, v_original.quantity_text, v_original.amount,
    v_original.id, btrim(p_reason)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;
