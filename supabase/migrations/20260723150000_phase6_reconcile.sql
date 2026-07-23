-- Sagefinan — phase 6: reconciliation, reason codes and session locking
--
-- Reason codes move from a fixed enum to a managed lookup table
-- (reason_codes) — SPEC.md's "add a code, retire a code, never delete a
-- code that's been used" requirement can't be met by a Postgres enum
-- (values can be added but never removed, and there's no per-value active
-- flag), so this is a structural change, not a style choice. The phase-1
-- `reason_code` enum and count_lines.reason_code column are retired in
-- favour of a FK to reason_codes.id.
--
-- A count line can now need up to two independent reasons: one for a
-- physical variance (existing reason_code, renamed reason_code_id) and one
-- for a "book differs" case (new book_diff_reason_code_id) — SPEC.md is
-- explicit these are different problems (a physical loss vs. a posting
-- discrepancy) and may both apply to the same line on a three-way mismatch.
-- reason_codes.applies_to narrows which chips a screen offers for each case.

-- ============================================================================
-- REASON CODES — managed lookup table
-- ============================================================================

create table reason_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  -- Which kind of line this code may be attached to. TRANSFER_NOT_POSTED,
  -- POSTING_ERROR, UNDER_INVESTIGATION and OTHER can explain either a
  -- physical variance or a pure book/ledger discrepancy; the rest
  -- (breakage, spillage, unrecorded sale, expired/damaged) only make sense
  -- as physical explanations.
  applies_to text not null check (applies_to in ('VARIANCE', 'BOOK_DIFF', 'BOTH')),
  -- OTHER means nothing on its own (SPEC.md) — enforced at lock time, not
  -- just in the UI, so a future admin-added code can opt into the same rule.
  requires_note boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into reason_codes (code, label, applies_to, requires_note) values
  ('BREAKAGE', 'Breakage', 'VARIANCE', false),
  ('SPILLAGE', 'Spillage', 'VARIANCE', false),
  ('UNRECORDED_SALE', 'Unrecorded sale', 'VARIANCE', false),
  ('TRANSFER_NOT_POSTED', 'Transfer not posted', 'BOTH', false),
  ('POSTING_ERROR', 'Posting error', 'BOTH', false),
  ('EXPIRED_DAMAGED', 'Expired or damaged', 'VARIANCE', false),
  ('UNDER_INVESTIGATION', 'Under investigation', 'BOTH', false),
  ('OTHER', 'Other', 'BOTH', true);

alter table reason_codes enable row level security;
create policy reason_codes_select on reason_codes for select using (true);
create policy reason_codes_insert on reason_codes for insert with check (app_current_role() = 'ADMIN');
create policy reason_codes_update on reason_codes for update using (app_current_role() = 'ADMIN');
-- No delete policy for anyone, by design — retiring is is_active=false, never a row delete.

-- ============================================================================
-- COUNT_LINES — reason_code enum column replaced by a FK, plus a parallel
-- set of columns for the independent "book differs" reason. reason_set_by/at
-- and book_diff_reason_set_by/at exist purely so the session audit trail
-- (below) can show "reason attached, by whom, when" as a real timestamped
-- event rather than inferring it from updated_at (count_lines has none).
-- ============================================================================

alter table count_lines drop column reason_code;

alter table count_lines
  add column reason_code_id uuid references reason_codes (id),
  add column reason_set_by uuid references profiles (id),
  add column reason_set_at timestamptz,
  add column book_diff_reason_code_id uuid references reason_codes (id),
  add column book_diff_note text,
  add column book_diff_reason_set_by uuid references profiles (id),
  add column book_diff_reason_set_at timestamptz;

drop type reason_code;

-- Tightened vs. phase 1: DEPARTMENT_USER/STOREKEEPER may not see
-- reconciliation, reasons or variance values at all (SPEC.md phase 6
-- Access), so — unlike count_sessions, which they may still see their own
-- department's rows of — count_lines drops the "own department" branch
-- entirely; it now carries expected/physical/ledger figures and reasons,
-- all off-limits to those two roles even as defence in depth.
drop policy count_lines_select on count_lines;
create policy count_lines_select on count_lines for select
  using (app_current_role() in ('ADMIN', 'AUDITOR'));

-- A locked session's count lines are frozen: figures, reasons, everything.
-- Enforced at the trigger level (not just by the app never calling update)
-- so a bug elsewhere can't silently overwrite a certified record — same
-- reasoning as check_business_day_lock in phase 3.
create function check_count_line_locked() returns trigger
language plpgsql
as $$
declare
  v_status session_status;
begin
  select status into v_status from count_sessions where id = old.count_session_id;
  if v_status = 'LOCKED' then
    raise exception 'This count session is locked — figures are permanent. Raise a post-lock adjustment instead.';
  end if;
  return new;
end;
$$;

create trigger count_lines_lock_guard
  before update on count_lines
  for each row execute function check_count_line_locked();

-- ============================================================================
-- COUNT_SESSIONS — who/when for "finished" and "locked", both needed by the
-- audit trail. updated_at already exists but is bumped by autosave too, so
-- it can't stand in for either event once other writes happen afterwards.
-- ============================================================================

alter table count_sessions
  add column finished_at timestamptz,
  add column finished_by uuid references profiles (id),
  add column locked_by uuid references profiles (id);

-- ============================================================================
-- FINISH COUNT SESSION — now stamps finished_at/finished_by. Signature
-- change (new p_finished_by param), so drop and recreate.
-- ============================================================================

drop function finish_count_session(uuid, boolean);

create function finish_count_session(
  p_session_id uuid,
  p_zero_fill_blanks boolean,
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

  update count_sessions
  set status = 'COMPLETED', updated_at = now(), finished_at = now(), finished_by = p_finished_by
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function finish_count_session(uuid, boolean, uuid) to service_role;

-- ============================================================================
-- LOCK COUNT SESSION — the core of this phase. Only permitted once every
-- non-tallying line (physical variance or book-difference) carries a reason
-- code, re-validated here from the database, never trusting the client
-- (SPEC.md's quality bar). "select ... for update" takes a row lock on the
-- session for the duration of the transaction, so two concurrent lock
-- attempts on the same session serialise instead of double-locking.
-- ============================================================================

create function lock_count_session(
  p_session_id uuid,
  p_locked_by uuid
) returns count_sessions
language plpgsql
as $$
declare
  v_session count_sessions%rowtype;
  v_unreasoned_variance int;
  v_unreasoned_book_diff int;
begin
  select * into v_session from count_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Count session not found.';
  end if;
  if v_session.status = 'LOCKED' then
    raise exception 'This session is already locked.';
  end if;
  if v_session.status = 'DRAFT' then
    raise exception 'Finish the count before locking.';
  end if;

  select count(*) into v_unreasoned_variance
  from count_lines cl
  left join reason_codes rc on rc.id = cl.reason_code_id
  where cl.count_session_id = p_session_id
    and cl.variance <> 0
    and (
      cl.reason_code_id is null
      or (rc.requires_note and (cl.note is null or btrim(cl.note) = ''))
    );

  select count(*) into v_unreasoned_book_diff
  from count_lines cl
  left join reason_codes rc on rc.id = cl.book_diff_reason_code_id
  where cl.count_session_id = p_session_id
    and cl.ledger_qty is not null
    and cl.ledger_qty <> cl.expected_qty
    and (
      cl.book_diff_reason_code_id is null
      or (rc.requires_note and (cl.book_diff_note is null or btrim(cl.book_diff_note) = ''))
    );

  if v_unreasoned_variance > 0 or v_unreasoned_book_diff > 0 then
    raise exception '% variance line(s) and % book-difference line(s) still need a reason before locking.',
      v_unreasoned_variance, v_unreasoned_book_diff;
  end if;

  update count_sessions
  set status = 'LOCKED', locked_at = now(), locked_by = p_locked_by, updated_at = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function lock_count_session(uuid, uuid) to service_role;

-- ============================================================================
-- POST-LOCK ADJUSTMENT — append-only correction on a locked session's line.
-- Never touches count_lines (the lock guard trigger above would reject it
-- anyway); only ever inserts into adjustments. previous_qty is the most
-- recent effective figure — the original certified physical_qty if this is
-- the line's first adjustment, otherwise the prior adjustment's new_qty —
-- so a chain of adjustments reads as a coherent chronological ledger
-- alongside the untouched original (SPEC.md: "never a replacement").
-- ============================================================================

create function record_post_lock_adjustment(
  p_count_line_id uuid,
  p_new_qty int,
  p_reason text,
  p_created_by uuid
) returns adjustments
language plpgsql
as $$
declare
  v_line count_lines%rowtype;
  v_session count_sessions%rowtype;
  v_previous int;
  v_adjustment adjustments%rowtype;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to raise a post-lock adjustment.';
  end if;
  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'The adjusted quantity must be zero or a positive whole number.';
  end if;

  select * into v_line from count_lines where id = p_count_line_id;
  if not found then
    raise exception 'Count line not found.';
  end if;

  select * into v_session from count_sessions where id = v_line.count_session_id;
  if v_session.status <> 'LOCKED' then
    raise exception 'Post-lock adjustments can only be raised on a locked session.';
  end if;

  select new_qty into v_previous from adjustments
  where count_line_id = p_count_line_id
  order by created_at desc
  limit 1;

  if not found then
    v_previous := coalesce(v_line.physical_qty, 0);
  end if;

  insert into adjustments (count_line_id, previous_qty, new_qty, reason, created_by)
  values (p_count_line_id, v_previous, p_new_qty, btrim(p_reason), p_created_by)
  returning * into v_adjustment;

  return v_adjustment;
end;
$$;

grant execute on function record_post_lock_adjustment(uuid, int, text, uuid) to service_role;

comment on table reason_codes is
  'Managed lookup, not free text (SPEC.md) — retiring sets is_active=false and never deletes a used code.';
comment on column count_lines.reason_code_id is
  'Reason for a physical variance (counted vs. expected). Frozen once the parent session is LOCKED — see count_lines_lock_guard.';
comment on column count_lines.book_diff_reason_code_id is
  'Reason for a book/ledger discrepancy (counted matches expected but ledger_qty does not) — a separate fact from reason_code_id, describing a posting problem rather than a physical loss.';
