-- Search performance — Purchases/Requisitions/Sales product search.
--
-- Diagnosis (measured against the real catalogue, not assumed): the seq
-- scan on products.code/name for an ilike '%term%' search executes in under
-- 1ms at the current ~300 products (EXPLAIN ANALYZE confirmed this before
-- writing this migration) — not today's bottleneck, but it will become one
-- as the catalogue grows toward the ~1,000 products SPEC.md targets, since a
-- leading-wildcard ilike can never use a plain btree index. Add a trigram
-- index now, while it's cheap and correctness-neutral, rather than waiting
-- for it to start mattering.
--
-- The measured bottleneck was actually get_department_balance being called
-- for the WHOLE department (every assigned product) on every keystroke, when
-- only the ~20 search results returned need a balance figure at all. Adding
-- an optional product_id filter (default null, so every existing caller is
-- unaffected) lets the search actions ask for balances on just the matched
-- products instead of the whole department.

create extension if not exists pg_trgm;

create index products_code_trgm_idx on products using gin (code gin_trgm_ops);
create index products_name_trgm_idx on products using gin (name gin_trgm_ops);

-- Signature change (new optional trailing param) — drop and recreate rather
-- than leaving two overloads around to drift out of sync, same pattern as
-- phase 6's finish_count_session change.
drop function get_department_balance(uuid, date);

create function get_department_balance(p_department_id uuid, p_as_at_date date, p_product_ids uuid[] default null)
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
    and (p_product_ids is null or p.id = any(p_product_ids))
  ),
  opening_movements as (
    select
      m.product_id,
      sum(case when m.reversal_of_movement_id is not null then -m.quantity else m.quantity end) as qty
    from movements m
    where m.to_department_id = p_department_id
    and m.type = 'OPENING'
    and m.business_day <= p_as_at_date
    and (p_product_ids is null or m.product_id = any(p_product_ids))
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
    and (p_product_ids is null or m.product_id = any(p_product_ids))
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
    and (p_product_ids is null or m.product_id = any(p_product_ids))
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

comment on function get_department_balance(uuid, date, uuid[]) is
  'Opening/received/issued/closing quantity and value per product for a department as at close of business on a given date. p_product_ids (optional, default null = every assigned product) restricts computation to a specific set of products — used by the Purchases/Requisitions/Sales product search so it never recomputes a balance for the whole department on every keystroke. Single source of truth for stock levels.';
