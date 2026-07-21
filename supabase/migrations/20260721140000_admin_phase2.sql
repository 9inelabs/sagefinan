-- Sagefinan — phase 2: admin (departments, products, users)
-- No new tables; all phase-1 tables already cover this phase's needs. Adds:
--   1. A trigger enforcing SPEC.md's "STOREKEEPER should be assigned to the
--      central store" rule at the database level, mirroring the
--      validate_movement pattern from phase 1 (a plain CHECK can't look up
--      another table's is_central_store flag).
--   2. admin_set_central_store() — atomically unflags the current central
--      store and flags a new one, so the two updates can't be observed
--      half-done (the partial unique index from phase 1 would reject doing
--      this as two separate, unordered statements against the same row set).
--   3. admin_import_products() — the CSV import commit step. A single
--      function call is one implicit transaction: an unhandled exception
--      partway through rolls back everything the function has done so far,
--      which is what gives the CSV importer its "single transaction" guarantee
--      without the server action needing a raw Postgres connection.

-- ============================================================================
-- STOREKEEPER must be assigned to the central store department
-- ============================================================================

create function validate_profile_department() returns trigger
language plpgsql
as $$
declare
  is_central boolean;
begin
  if new.role = 'STOREKEEPER' and new.department_id is not null then
    select is_central_store into is_central from departments where id = new.department_id;
    if not coalesce(is_central, false) then
      raise exception 'STOREKEEPER must be assigned to the central store department';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_profile_department_trigger
  before insert or update on profiles
  for each row execute function validate_profile_department();

-- ============================================================================
-- Atomic central-store reassignment
-- ============================================================================

create function admin_set_central_store(p_department_id uuid) returns void
language plpgsql
as $$
begin
  update departments set is_central_store = false where is_central_store = true and id <> p_department_id;
  update departments set is_central_store = true where id = p_department_id;
end;
$$;

-- ============================================================================
-- CSV import commit (dry-run validation happens in the server action; this
-- function only ever receives rows already validated against known
-- department ids, so it does no name resolution and never creates a
-- department implicitly)
-- ============================================================================

create function admin_import_products(p_rows jsonb)
returns table(code text, action text)
language plpgsql
as $$
declare
  v_row jsonb;
  v_product_id uuid;
  v_code text;
  v_dept_id uuid;
  v_shelf_order integer;
  v_action text;
begin
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_code := v_row->>'code';

    select id into v_product_id from products where products.code = v_code;

    if v_product_id is null then
      insert into products (code, name, unit_cost)
      values (v_code, v_row->>'name', (v_row->>'unit_cost')::numeric)
      returning id into v_product_id;
      v_action := 'created';
    else
      update products
      set name = v_row->>'name', unit_cost = (v_row->>'unit_cost')::numeric
      where id = v_product_id;
      v_action := 'updated';
    end if;

    v_shelf_order := nullif(v_row->>'shelf_order', '')::integer;

    for v_dept_id in select value::uuid from jsonb_array_elements_text(v_row->'department_ids')
    loop
      insert into product_assignments (department_id, product_id, shelf_order)
      values (v_dept_id, v_product_id, v_shelf_order)
      on conflict (department_id, product_id)
      do update set shelf_order = coalesce(excluded.shelf_order, product_assignments.shelf_order);
    end loop;

    code := v_code;
    action := v_action;
    return next;
  end loop;
end;
$$;
