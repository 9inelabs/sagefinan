-- get_department_balance: the heart of the system.
--
-- Computes, per product assigned to a department, the opening/received/issued/
-- closing quantity (in bottles) and their values (qty * unit_cost) as at close
-- of business on a given date. Powers the stock ledger, the sales screen and
-- the count comparison — nowhere else recomputes this.
--
-- The trick that makes one function correct for both department shapes: a
-- movement's to_department_id is only ever set for the side that *receives*
-- stock (PURCHASE -> central store, REQUISITION -> the destination department)
-- and from_department_id only ever set for the side that *gives up* stock
-- (REQUISITION <- central store, SALE <- the selling department). So "inbound"
-- is simply "sum where to_department_id = this department" and "outbound" is
-- "sum where from_department_id = this department", for every department,
-- without branching on is_central_store:
--   central store   : inbound = purchases,    outbound = requisitions out
--   other department: inbound = requisitions in, outbound = sales
--
-- opening  = net of all movements strictly before p_as_at_date
-- received = inbound movements on p_as_at_date
-- issued   = outbound movements on p_as_at_date
-- closing  = opening + received - issued
--
-- Products with no movements yet still appear (from product_assignments),
-- with zeros throughout, via the left joins below.
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
      sum(m.quantity) filter (where m.business_day < p_as_at_date) as pre_qty,
      sum(m.quantity) filter (where m.business_day = p_as_at_date) as day_qty
    from movements m
    where m.to_department_id = p_department_id
    and m.business_day <= p_as_at_date
    group by m.product_id
  ),
  outbound as (
    select
      m.product_id,
      sum(m.quantity) filter (where m.business_day < p_as_at_date) as pre_qty,
      sum(m.quantity) filter (where m.business_day = p_as_at_date) as day_qty
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
  'Opening/received/issued/closing quantity and value per product for a department as at close of business on a given date, computed by summing movements. Single source of truth for stock levels — see SPEC.md.';

grant execute on function get_department_balance(uuid, date) to authenticated, service_role;
