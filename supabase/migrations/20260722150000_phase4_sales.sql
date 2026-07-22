-- Sagefinan — phase 4: sales entry, draft batches, sale corrections
--
-- No changes to movements' columns or check constraints — a SALE row reuses
-- is_override/override_reason exactly like a REQUISITION's over-issue, and a
-- sales correction reuses reversal_of_movement_id exactly like phase 3's
-- reversal model (same type/product/from/to as the movement it reverses,
-- reason stored in `note`). See post_sales_batch below for both.
--
-- One new table: sale_drafts. A draft is deliberately NOT a movement — it's
-- mutable and deletable (unlike movements, which are never updated/deleted),
-- since it has no accounting effect until posted. Tied to (department_id,
-- business_day, created_by) per SPEC.md's phase 4 brief ("tied to me, the
-- department and the business day") — two different users building batches
-- for the same department/day get independent drafts.

-- ============================================================================
-- SALE DRAFTS
-- ============================================================================

create table sale_drafts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments (id),
  business_day date not null,
  created_by uuid not null references profiles (id),
  -- Array of {productId, code, name, openingQty, receivedQty, quantity,
  -- isOverride, overrideReason, correctionOfMovementId, correctionReason} —
  -- the exact shape the batch UI holds in memory, so a restore is a straight
  -- assignment with no reshaping.
  lines jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (department_id, business_day, created_by)
);

alter table sale_drafts enable row level security;

create policy sale_drafts_select on sale_drafts for select
  using (app_current_role() in ('ADMIN', 'AUDITOR') or created_by = auth.uid());
create policy sale_drafts_insert on sale_drafts for insert
  with check (created_by = auth.uid());
create policy sale_drafts_update on sale_drafts for update
  using (created_by = auth.uid());
create policy sale_drafts_delete on sale_drafts for delete
  using (created_by = auth.uid());

comment on table sale_drafts is
  'In-progress sales batches, saved as lines are added so a closed tab or dropped connection loses nothing. Not a movement — affects no balance until post_sales_batch runs. See SPEC.md''s draft batch behaviour section.';

-- ============================================================================
-- POST SALES BATCH — one call, one transaction: every line (fresh sales and
-- corrections alike) all lands or none does.
--
-- Zero-sales convention (SPEC.md): a line with quantity = 0 is a valid,
-- explicit "checked, nothing sold" entry, but — like a product never added to
-- the batch — it writes no movement row (a zero-quantity SALE would be
-- meaningless: get_department_balance already treats a missing movement as
-- zero, and movements.quantity's `check (quantity > 0)` constraint would
-- reject it anyway). The line still counts as "touched" for the batch's own
-- zero-sales summary — that bookkeeping lives entirely in the UI/draft, not
-- in the movements table.
--
-- Correction lines (correction_of_movement_id set): reverse the existing sale
-- first — same reason/preserve-both-records model as post_movement_reversal
-- (phase 3) — then, only if the corrected quantity is > 0, insert the new
-- SALE. A correction to zero is valid: it reverses the old figure and simply
-- writes no replacement.
-- ============================================================================

create function post_sales_batch(
  p_business_day date,
  p_department_id uuid,
  p_created_by uuid,
  p_lines jsonb -- [{product_id, quantity, is_override, override_reason, correction_of_movement_id, correction_reason}]
) returns setof uuid
language plpgsql
as $$
declare
  v_is_central boolean;
  v_line jsonb;
  v_product_id uuid;
  v_quantity int;
  v_is_override boolean;
  v_override_reason text;
  v_correction_of uuid;
  v_correction_reason text;
  v_available int;
  v_existing_sale movements%rowtype;
  v_new_id uuid;
begin
  select is_central_store into v_is_central from departments where id = p_department_id;
  if v_is_central is null then
    raise exception 'Department not found.';
  end if;
  if v_is_central then
    raise exception 'The central store has no sales — it issues requisitions instead.';
  end if;

  if jsonb_array_length(p_lines) = 0 then
    raise exception 'A sales batch needs at least one line.';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_quantity := (v_line->>'quantity')::int;
    v_is_override := coalesce((v_line->>'is_override')::boolean, false);
    v_override_reason := nullif(v_line->>'override_reason', '');
    v_correction_of := nullif(v_line->>'correction_of_movement_id', '')::uuid;
    v_correction_reason := nullif(v_line->>'correction_reason', '');

    if v_quantity is null or v_quantity < 0 then
      raise exception 'Quantity sold must be zero or a positive whole number.';
    end if;

    if v_is_override and v_override_reason is null then
      raise exception 'An override reason is required for product %.', v_product_id;
    end if;

    if v_correction_of is not null then
      if v_correction_reason is null then
        raise exception 'A reason is required to reverse the existing sale for product %.', v_product_id;
      end if;

      select * into v_existing_sale from movements where id = v_correction_of;
      if not found then
        raise exception 'The sale being corrected no longer exists.';
      end if;
      if v_existing_sale.type <> 'SALE'
        or v_existing_sale.from_department_id <> p_department_id
        or v_existing_sale.product_id <> v_product_id
        or v_existing_sale.business_day <> p_business_day
      then
        raise exception 'The sale being corrected does not match this batch line.';
      end if;
      if v_existing_sale.reversal_of_movement_id is not null then
        raise exception 'That movement is itself a reversal and cannot be reversed here.';
      end if;
      if exists (select 1 from movements where reversal_of_movement_id = v_correction_of) then
        raise exception 'That sale has already been reversed.';
      end if;

      insert into movements (
        business_day, type, product_id, from_department_id, to_department_id,
        quantity, note, created_by, reversal_of_movement_id
      )
      values (
        v_existing_sale.business_day, v_existing_sale.type, v_existing_sale.product_id,
        v_existing_sale.from_department_id, v_existing_sale.to_department_id,
        v_existing_sale.quantity, btrim(v_correction_reason), p_created_by, v_existing_sale.id
      )
      returning id into v_new_id;
      return next v_new_id;
    else
      -- Not a correction: guard against double-posting a fresh sale — the
      -- authoritative check (the UI's add-to-batch check is just a friendly
      -- early warning, same relationship as the requisition over-issue check
      -- in phase 3).
      if exists (
        select 1 from movements m
        where m.type = 'SALE'
          and m.from_department_id = p_department_id
          and m.product_id = v_product_id
          and m.business_day = p_business_day
          and m.reversal_of_movement_id is null
          and not exists (select 1 from movements r where r.reversal_of_movement_id = m.id)
      ) then
        raise exception 'Sales for this product on this business day have already been posted — reverse and correct instead of adding a second line.';
      end if;
    end if;

    if v_quantity > 0 then
      select opening_qty + received_qty into v_available
      from get_department_balance(p_department_id, p_business_day)
      where product_id = v_product_id;

      v_available := coalesce(v_available, 0);

      if v_quantity > v_available and not v_is_override then
        raise exception 'Opening plus received for this product as at % is % — % requested. Use the override to proceed anyway.',
          to_char(p_business_day, 'DD Mon YYYY'), v_available, v_quantity;
      end if;

      insert into movements (
        business_day, type, product_id, from_department_id, quantity,
        is_override, override_reason, created_by
      )
      values (
        p_business_day, 'SALE', v_product_id, p_department_id, v_quantity,
        v_is_override, v_override_reason, p_created_by
      )
      returning id into v_new_id;
      return next v_new_id;
    end if;
  end loop;
end;
$$;

grant execute on function post_sales_batch(date, uuid, uuid, jsonb) to service_role;
