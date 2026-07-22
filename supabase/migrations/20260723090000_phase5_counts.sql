-- Sagefinan — phase 5: stock count and variance comparison
--
-- No new tables — count_sessions/count_lines/adjustments already exist from
-- phase 1. One new column (count_sessions.updated_at) plus three RPCs, each a
-- multi-row atomic write per CLAUDE.md's convention, and one read-model view.
--
-- Blind counting (SPEC.md): expected_qty must never reach the browser while a
-- session is DRAFT. That's enforced entirely in application code (the count
-- screen's server actions select an explicit column list that omits
-- expected_qty — see lib/counts/actions.ts) — nothing in this migration
-- computes or reveals it early; it only becomes a real, non-placeholder
-- figure inside finish_count_session, in the same transaction that flips the
-- session to COMPLETED.
--
-- Frozen expected (SPEC.md): expected_qty is written once, at finish, and
-- never recomputed afterwards — a movement posted later must not silently
-- change a session's variance report. finish_count_session is the only place
-- that ever writes expected_qty.

-- ============================================================================
-- COUNT_SESSIONS: updated_at — a real, reload-proof "draft saved" timestamp
-- for the take-stock screen, bumped by autosave and by finishing.
-- ============================================================================

alter table count_sessions add column updated_at timestamptz not null default now();

-- ============================================================================
-- START OR OPEN A COUNT SESSION
--
-- "One session per department per as-at date ... if one is in progress, open
-- it rather than creating a duplicate." Creating the session row and
-- snapshotting every active assigned product as a count_line must happen
-- together — a session with a partial product snapshot is a session that
-- silently under-counts a department, so this is a single transaction.
-- ============================================================================

create function start_or_open_count_session(
  p_department_id uuid,
  p_as_at_date date,
  p_counted_by uuid
) returns count_sessions
language plpgsql
as $$
declare
  v_session count_sessions%rowtype;
begin
  if not exists (select 1 from departments where id = p_department_id and is_active) then
    raise exception 'Department not found or inactive.';
  end if;

  select * into v_session from count_sessions
  where department_id = p_department_id and as_at_date = p_as_at_date;

  if found then
    return v_session;
  end if;

  insert into count_sessions (department_id, as_at_date, counted_by, status)
  values (p_department_id, p_as_at_date, p_counted_by, 'DRAFT')
  returning * into v_session;

  -- Snapshot: products assigned when the session begins, in shelf order.
  -- Products assigned later never retroactively appear (SPEC.md).
  insert into count_lines (count_session_id, product_id, expected_qty)
  select v_session.id, pa.product_id, 0
  from product_assignments pa
  join products p on p.id = pa.product_id
  where pa.department_id = p_department_id
    and p.is_active;

  return v_session;
end;
$$;

grant execute on function start_or_open_count_session(uuid, date, uuid) to service_role;

-- ============================================================================
-- FINISH COUNT SESSION
--
-- Optionally zero-fills remaining blanks (only when the auditor explicitly
-- chose that on the "blank entries remain" prompt — the client always
-- surfaces the blank list first; this function re-checks server-side rather
-- than trusting that prompt happened), then computes and freezes expected_qty
-- for every line from get_department_balance, then flips status to
-- COMPLETED. One transaction: a session can't end up with some lines frozen
-- and others not.
--
-- expected_qty = closing_qty from get_department_balance — no branching on
-- is_central_store needed, since that function's inbound/outbound convention
-- already generalizes "opening + purchases − requisitions out" (central
-- store) and "opening + requisitions in − sales" (everyone else) into one
-- closing figure (see SPEC.md / balance function comments).
-- ============================================================================

create function finish_count_session(
  p_session_id uuid,
  p_zero_fill_blanks boolean
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

  if v_blank_count > 0 then
    if not p_zero_fill_blanks then
      raise exception '% product(s) have not been counted yet.', v_blank_count;
    end if;
    update count_lines set physical_qty = 0
    where count_session_id = p_session_id and physical_qty is null;
  end if;

  update count_lines cl
  set expected_qty = coalesce(b.closing_qty, 0)
  from get_department_balance(v_session.department_id, v_session.as_at_date) b
  where cl.count_session_id = p_session_id
    and b.product_id = cl.product_id;
  -- A line whose product no longer appears in get_department_balance (e.g.
  -- deactivated after this session's snapshot was taken) keeps expected_qty
  -- at 0 — a rare edge case, not a reason to fail the whole finish.

  update count_sessions
  set status = 'COMPLETED', updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function finish_count_session(uuid, boolean) to service_role;

-- ============================================================================
-- RECORD COUNT ADJUSTMENT (correcting a miscount, pre-lock)
--
-- "Let me edit a physical count directly from the compare screen ... record
-- every such edit in the adjustments table ... even pre-lock." The insert
-- into adjustments and the update to count_lines.physical_qty must both
-- happen or neither does — a recorded adjustment with no matching change (or
-- vice versa) would break the "demonstrable, not asserted" guarantee this
-- exists for. expected_qty is deliberately untouched.
-- ============================================================================

create function record_count_adjustment(
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

  update count_lines set physical_qty = p_new_qty where id = p_count_line_id
  returning * into v_line;

  return v_line;
end;
$$;

grant execute on function record_count_adjustment(uuid, int, text, uuid) to service_role;

-- ============================================================================
-- COUNT SESSIONS SUMMARY VIEW — the single read model for the Session list
-- and the Compare landing page. Only ever queried via the service-role admin
-- client (same trust boundary as movements_detail), ADMIN/AUDITOR-only routes.
--
-- variance_count/variance_value are null while a session is DRAFT: before
-- finish_count_session runs, expected_qty is still its 0 placeholder default,
-- so "variance" would just be a meaningless echo of whatever's been typed so
-- far, not a real figure — showing it (even off the counting screen itself,
-- e.g. to the same auditor browsing the session list in another tab) would
-- be misleading.
-- ============================================================================

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
  end as variance_value
from count_sessions cs
join departments d on d.id = cs.department_id
join profiles pr on pr.id = cs.counted_by
left join count_lines cl on cl.count_session_id = cs.id
left join products p on p.id = cl.product_id
group by cs.id, d.name, pr.full_name;

grant select on count_sessions_summary to service_role;

comment on view count_sessions_summary is
  'Read model for the Session list and Compare landing page. variance_count/variance_value are null for DRAFT sessions since expected_qty is still an unfrozen placeholder — see SPEC.md''s frozen-expected rule.';
