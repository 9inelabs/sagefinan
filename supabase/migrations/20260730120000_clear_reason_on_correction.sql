-- Correcting a miscount (pre-lock, from Compare stock or Reconcile) already
-- overwrites physical_qty and logs an adjustments row. It did not, until
-- now, do anything about a previously-attached variance reason — if a line
-- was tagged e.g. "Breakage" while short, then corrected back to matching
-- expected, the reason stayed in the database describing a variance that no
-- longer exists (invisible once the line drops off the outstanding list,
-- but stale data, and it would wrongly keep an UNDER_INVESTIGATION line
-- "open" on that report forever even after the miscount was fixed).
--
-- Only the *variance* reason is cleared, and only when the corrected
-- quantity now exactly equals expected_qty — the book-difference reason
-- (book_diff_reason_code_id/book_diff_note) describes a ledger discrepancy
-- that has nothing to do with the physical figure, so it's untouched here.

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
  v_now_tallies boolean;
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

  v_now_tallies := (p_new_qty = v_line.expected_qty);

  update count_lines
  set physical_qty = p_new_qty,
      is_auto_filled = false,
      reason_code_id = case when v_now_tallies then null else reason_code_id end,
      note = case when v_now_tallies then null else note end,
      reason_set_by = case when v_now_tallies then null else reason_set_by end,
      reason_set_at = case when v_now_tallies then null else reason_set_at end
  where id = p_count_line_id
  returning * into v_line;

  return v_line;
end;
$$;

grant execute on function record_count_adjustment(uuid, int, text, uuid) to service_role;

comment on function record_count_adjustment(uuid, int, text, uuid) is
  'Corrects a pre-lock miscount: logs an adjustments row, updates physical_qty, clears is_auto_filled. Also clears the variance reason (reason_code_id/note) if the corrected quantity now exactly equals expected_qty — that reason no longer describes anything real. The book-difference reason is untouched (it concerns the ledger figure, not the physical count).';
