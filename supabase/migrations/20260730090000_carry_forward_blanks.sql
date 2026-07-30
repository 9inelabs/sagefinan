-- Carry-forward blanks — an uncounted product no longer defaults to 0 when
-- a session is finished. It's recorded at its own expected quantity for the
-- same as-at date (the get_department_balance figure the very next
-- statement already computes to freeze expected_qty), so an uncounted
-- product tallies — no variance — instead of reading as entirely missing.
-- is_auto_filled marks exactly which lines were never physically counted,
-- so the UI can flag them distinctly: this must never be confused with a
-- real, verified count (SPEC.md's "demonstrable, not asserted" principle).

alter table count_lines add column is_auto_filled boolean not null default false;

comment on column count_lines.is_auto_filled is
  'True when physical_qty was carried forward from the expected figure at finish (the product was never actually counted), not entered by the auditor. Cleared to false the moment a real correction is recorded via record_count_adjustment — a correction is always a real, asserted figure.';

-- ============================================================================
-- FINISH COUNT SESSION — p_zero_fill_blanks renamed p_carry_forward_blanks;
-- blanks are filled from get_department_balance's closing_qty for this
-- session's own as_at_date (== expected_qty), not 0.
-- ============================================================================

drop function finish_count_session(uuid, boolean, uuid);

create function finish_count_session(
  p_session_id uuid,
  p_carry_forward_blanks boolean,
  p_finished_by uuid
) returns count_sessions
language plpgsql
as $$
declare
  v_session count_sessions%rowtype;
  v_blank_count int;
begin
  select * into v_session from count_sessions where id = p_session_id;
  if not found then
    raise exception 'Count session not found.';
  end if;
  if v_session.status <> 'DRAFT' then
    raise exception 'This count has already been finished.';
  end if;

  select count(*) into v_blank_count
  from count_lines where count_session_id = p_session_id and physical_qty is null;

  if v_blank_count > 0 and not p_carry_forward_blanks then
    raise exception '% product(s) have not been counted yet.', v_blank_count;
  end if;

  if v_blank_count > 0 then
    -- Carry forward this session's own expected figure for anything still
    -- blank, from the same balance computation the next statement uses to
    -- freeze expected_qty — "uncounted" and "expected" land on exactly the
    -- same number, so the line tallies rather than showing as missing.
    update count_lines cl
    set physical_qty = coalesce(b.closing_qty, 0),
        is_auto_filled = true
    from get_department_balance(v_session.department_id, v_session.as_at_date) b
    where cl.count_session_id = p_session_id
      and cl.physical_qty is null
      and b.product_id = cl.product_id;

    -- A line whose product doesn't appear in the balance result at all
    -- (e.g. deactivated after this session's snapshot) still needs some
    -- figure to finish — falls back to 0, the same edge case the old
    -- zero-fill covered for every blank line, not just carried-forward ones.
    update count_lines
    set physical_qty = 0, is_auto_filled = true
    where count_session_id = p_session_id and physical_qty is null;
  end if;

  update count_lines cl
  set expected_qty = coalesce(b.closing_qty, 0)
  from get_department_balance(v_session.department_id, v_session.as_at_date) b
  where cl.count_session_id = p_session_id
    and b.product_id = cl.product_id;

  update count_sessions
  set status = 'COMPLETED', updated_at = now(), finished_at = now(), finished_by = p_finished_by
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function finish_count_session(uuid, boolean, uuid) to service_role;

comment on function finish_count_session(uuid, boolean, uuid) is
  'Carries forward each still-blank line''s expected figure (get_department_balance''s closing_qty for this session''s as_at_date) rather than zero-filling, flagging it is_auto_filled. Freezes expected_qty for every line exactly once, same as before.';

-- ============================================================================
-- RECORD COUNT ADJUSTMENT — a manual correction is always a real, asserted
-- figure: clear is_auto_filled the moment one is recorded, regardless of
-- whether the line was auto-filled before.
-- ============================================================================

create or replace function record_count_adjustment(
  p_count_line_id uuid,
  p_new_qty int,
  p_reason text,
  p_created_by uuid
) returns count_lines
language plpgsql
as $$
declare
  v_line count_lines%rowtype;
  v_session count_sessions%rowtype;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to correct a count entry.';
  end if;
  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'The corrected quantity must be zero or a positive whole number.';
  end if;

  select * into v_line from count_lines where id = p_count_line_id;
  if not found then
    raise exception 'Count line not found.';
  end if;

  select * into v_session from count_sessions where id = v_line.count_session_id;
  if v_session.status = 'LOCKED' then
    raise exception 'This session is locked and read-only.';
  end if;
  if v_session.status = 'DRAFT' then
    raise exception 'Finish the count before correcting entries.';
  end if;

  insert into adjustments (count_line_id, previous_qty, new_qty, reason, created_by)
  values (p_count_line_id, coalesce(v_line.physical_qty, 0), p_new_qty, btrim(p_reason), p_created_by);

  update count_lines set physical_qty = p_new_qty, is_auto_filled = false where id = p_count_line_id
  returning * into v_line;

  return v_line;
end;
$$;

grant execute on function record_count_adjustment(uuid, int, text, uuid) to service_role;

-- ============================================================================
-- COUNT_SESSIONS_SUMMARY — add not_counted_count (null while DRAFT, same
-- convention as variance_count/variance_value: nothing is frozen yet).
-- ============================================================================

drop view count_sessions_summary;

create view count_sessions_summary as
select
  cs.id,
  cs.department_id,
  d.name as department_name,
  cs.as_at_date,
  cs.counted_by,
  pr.full_name as counted_by_name,
  cs.status,
  cs.created_at,
  cs.updated_at,
  cs.locked_at,
  count(cl.id) as product_count,
  count(cl.id) filter (where cl.physical_qty is not null) as counted_count,
  case when cs.status = 'DRAFT' then null else
    count(cl.id) filter (
      where cl.physical_qty is not null
        and (cl.variance <> 0 or (cl.ledger_qty is not null and cl.ledger_qty <> cl.expected_qty))
    )
  end as variance_count,
  case when cs.status = 'DRAFT' then null else
    coalesce(sum(cl.variance * p.unit_cost) filter (where cl.physical_qty is not null), 0)
  end as variance_value,
  case when cs.status = 'DRAFT' then null else
    count(cl.id) filter (where cl.is_auto_filled)
  end as not_counted_count
from count_sessions cs
join departments d on d.id = cs.department_id
join profiles pr on pr.id = cs.counted_by
left join count_lines cl on cl.count_session_id = cs.id
left join products p on p.id = cl.product_id
group by cs.id, d.name, pr.full_name;

grant select on count_sessions_summary to service_role;

comment on view count_sessions_summary is
  'Read model for the Session list and Compare landing page. variance_count/variance_value/not_counted_count are null for DRAFT sessions since expected_qty is still an unfrozen placeholder — see SPEC.md''s frozen-expected rule.';
