-- Opening balances — brought forward from the phase 8 plan.
--
-- Decision (documented in SPEC.md): opening stock is a distinct movement
-- type, OPENING, rather than a flagged PURCHASE or a special-cased column.
-- Reusing PURCHASE would be wrong twice over — it's central-store-only
-- (validate_movement), and a real purchase has a supplier, which an opening
-- snapshot doesn't. A distinct type keeps it identifiable/reportable
-- (filterable on /movements, its own row in CSV exports) without inventing
-- a parallel table, and it flows through the exact same immutable-ledger,
-- reversal and business-day-lock machinery every other movement type does.
--
-- Shape: like PURCHASE, one-sided (from_department_id null, to_department_id
-- = the department getting the balance) — but unlike PURCHASE, valid for
-- ANY department including the central store, since a central store needs a
-- starting balance exactly as much as any other department does.

-- ============================================================================
-- MOVEMENT SHAPE — OPENING is one-sided like PURCHASE, but not
-- central-store-restricted.
-- ============================================================================

alter table movements drop constraint movement_department_shape;
alter table movements add constraint movement_department_shape check (
  (type = 'PURCHASE' and from_department_id is null and to_department_id is not null)
  or (type = 'OPENING' and from_department_id is null and to_department_id is not null)
  or (type = 'REQUISITION' and from_department_id is not null and to_department_id is not null and from_department_id <> to_department_id)
  or (type = 'SALE' and from_department_id is not null and to_department_id is null)
);

create or replace function validate_movement() returns trigger
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

  -- OPENING: no restriction — every department type, including the central
  -- store, needs a starting balance (SPEC.md).

  if new.type = 'REQUISITION' and (not from_is_central or to_is_central) then
    raise exception 'REQUISITION movements must go from the central store to a non-central department';
  end if;

  if new.type = 'SALE' and from_is_central then
    raise exception 'SALE movements cannot be recorded against the central store';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- BALANCE FUNCTION — OPENING movements are folded into opening_qty for every
-- date on/after their own business_day (<=), never into received_qty. Every
-- other inbound type keeps the existing rule: strictly-earlier dates (<)
-- count toward opening, the exact day (=) counts toward received. This is
-- what makes "opening and closing both read exactly what I entered, as at
-- the date I chose" literally true on the opening date itself — without it,
-- an opening balance dated today would show as a "receipt" today and 0
-- opening, rather than being the opening figure itself.
--
-- A reversal of an OPENING movement (see post_opening_balances below) shares
-- its type, so it automatically gets the same <= treatment and nets out
-- correctly for every date at/after the reversal's own business_day too.
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
  opening_movements as (
    select
      m.product_id,
      sum(case when m.reversal_of_movement_id is not null then -m.quantity else m.quantity end) as qty
    from movements m
    where m.to_department_id = p_department_id
    and m.type = 'OPENING'
    and m.business_day <= p_as_at_date
    group by m.product_id
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
    and m.type <> 'OPENING'
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
    (coalesce(om.qty, 0) + coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0))::int as opening_qty,
    coalesce(i.day_qty, 0)::int as received_qty,
    coalesce(o.day_qty, 0)::int as issued_qty,
    (coalesce(om.qty, 0) + coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0) + coalesce(i.day_qty, 0) - coalesce(o.day_qty, 0))::int as closing_qty,
    (coalesce(om.qty, 0) + coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0)) * ap.unit_cost as opening_value,
    coalesce(i.day_qty, 0) * ap.unit_cost as received_value,
    coalesce(o.day_qty, 0) * ap.unit_cost as issued_value,
    (coalesce(om.qty, 0) + coalesce(i.pre_qty, 0) - coalesce(o.pre_qty, 0) + coalesce(i.day_qty, 0) - coalesce(o.day_qty, 0)) * ap.unit_cost as closing_value
  from assigned_products ap
  left join opening_movements om on om.product_id = ap.product_id
  left join inbound i on i.product_id = ap.product_id
  left join outbound o on o.product_id = ap.product_id
  order by ap.product_name;
$$;

comment on function get_department_balance(uuid, date) is
  'Opening/received/issued/closing quantity and value per product for a department as at close of business on a given date. OPENING movements fold into opening_qty for every date >= their own business_day (never into received_qty) — see SPEC.md''s opening-balance model. Single source of truth for stock levels.';

-- ============================================================================
-- POST OPENING BALANCES — one call, one transaction, for both the CSV
-- importer and the on-screen form. Each line optionally names an existing
-- live OPENING movement to replace: replacing reuses post_movement_reversal
-- (generic across every movement type already) to cancel the old entry
-- cleanly, then inserts the new one — never two live openings stacked for
-- the same department+product. A quantity of 0 follows the same convention
-- as phase 4's zero-sales lines: no movement is written for it (the
-- movements.quantity > 0 check couldn't store one anyway), so a replacement
-- with a 0 new quantity reverses the old entry and simply writes no
-- replacement, leaving the product reading 0 (indistinguishable afterwards
-- from "never set" — an accepted consequence, same as zero-sales).
-- ============================================================================

create function post_opening_balances(
  p_created_by uuid,
  p_lines jsonb -- [{department_id, product_id, business_day, quantity, replace_movement_id}]
) returns setof uuid
language plpgsql
as $$
declare
  v_line jsonb;
  v_id uuid;
  v_replace_id uuid;
  v_quantity int;
begin
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'An opening-balance batch needs at least one line.';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_quantity := (v_line->>'quantity')::int;
    if v_quantity is null or v_quantity < 0 then
      raise exception 'Opening quantity must be zero or a positive whole number.';
    end if;

    v_replace_id := nullif(v_line->>'replace_movement_id', '')::uuid;
    if v_replace_id is not null then
      perform post_movement_reversal(v_replace_id, 'Replaced by a new opening-balance entry.', p_created_by);
    end if;

    if v_quantity > 0 then
      insert into movements (business_day, type, product_id, to_department_id, quantity, created_by)
      values (
        (v_line->>'business_day')::date, 'OPENING', (v_line->>'product_id')::uuid,
        (v_line->>'department_id')::uuid, v_quantity, p_created_by
      )
      returning id into v_id;
      return next v_id;
    end if;
  end loop;
end;
$$;

grant execute on function post_opening_balances(uuid, jsonb) to service_role;

comment on function post_opening_balances(uuid, jsonb) is
  'One transaction for a whole opening-balance batch (CSV import or the on-screen form). Replacing an existing entry reverses it first via post_movement_reversal, then inserts the new one — never stacks two live OPENING movements for the same department+product.';
