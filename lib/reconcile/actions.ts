"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCountSessionMeta, type SessionMeta, type SessionStatus } from "@/lib/counts/actions";

type AdminClient = ReturnType<typeof createAdminClient>;

async function namesByProfileId(admin: AdminClient, ids: Iterable<string | null | undefined>) {
  const unique = Array.from(new Set(Array.from(ids).filter((id): id is string => !!id)));
  if (unique.length === 0) return new Map<string, string>();
  const { data, error } = await admin.from("profiles").select("id, full_name").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

// ============================================================================
// RECONCILE SCREEN — every non-tallying line (physical variance or book
// difference) in a COMPLETED/LOCKED session, plus its reason state and (once
// LOCKED) the full chain of post-lock adjustments alongside the untouched
// original figure.
// ============================================================================

export type PostLockAdjustment = {
  id: string;
  previousQty: number;
  newQty: number;
  reason: string;
  createdByName: string;
  createdAt: string;
};

export type ReconcileLine = {
  id: string;
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  expectedQty: number;
  countedQty: number;
  ledgerQty: number | null;
  unitCost: number;
  variance: number;
  value: number;
  flag: "short" | "excess";
  bookDiffers: boolean;
  reasonCodeId: string | null;
  note: string | null;
  reasonSetByName: string | null;
  reasonSetAt: string | null;
  bookDiffReasonCodeId: string | null;
  bookDiffNote: string | null;
  bookDiffReasonSetByName: string | null;
  bookDiffReasonSetAt: string | null;
  isVarianceReasoned: boolean;
  isBookDiffReasoned: boolean;
  adjustments: PostLockAdjustment[];
};

export type ReconcileSessionMeta = SessionMeta & {
  countedByName: string;
  finishedAt: string | null;
  finishedByName: string | null;
  lockedAt: string | null;
  lockedByName: string | null;
};

export async function getReconcileData(
  sessionId: string
): Promise<{ session: ReconcileSessionMeta; lines: ReconcileLine[]; progress: { reconciled: number; total: number } }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const baseSession = await getCountSessionMeta(sessionId);
  if (baseSession.status === "DRAFT") {
    throw new Error("Finish the count before reconciling.");
  }

  const { data: sessionRow, error: sessionError } = await admin
    .from("count_sessions")
    .select("counted_by, finished_at, finished_by, locked_at, locked_by")
    .eq("id", sessionId)
    .single();
  if (sessionError || !sessionRow) throw new Error(sessionError?.message ?? "Count session not found.");

  const { data: rows, error } = await admin
    .from("count_lines")
    .select(
      "id, product_id, expected_qty, physical_qty, ledger_qty, reason_code_id, note, reason_set_by, reason_set_at, book_diff_reason_code_id, book_diff_note, book_diff_reason_set_by, book_diff_reason_set_at, products(code, name, unit_cost)"
    )
    .eq("count_session_id", sessionId);
  if (error) throw new Error(error.message);

  const { data: assignments } = await admin
    .from("product_assignments")
    .select("product_id, shelf_order")
    .eq("department_id", baseSession.departmentId);
  const shelfByProduct = new Map((assignments ?? []).map((a) => [a.product_id, a.shelf_order]));

  const { data: reasonCodeMeta } = await admin.from("reason_codes").select("id, requires_note");
  const requiresNoteById = new Map((reasonCodeMeta ?? []).map((r) => [r.id, r.requires_note]));

  const mismatches = (rows ?? []).filter((r) => {
    const variance = (r.physical_qty ?? 0) - r.expected_qty;
    const bookDiffers = r.ledger_qty != null && r.ledger_qty !== r.expected_qty;
    return variance !== 0 || bookDiffers;
  });

  const lineIds = mismatches.map((r) => r.id);
  let rawAdjustments: {
    id: string;
    count_line_id: string;
    previous_qty: number;
    new_qty: number;
    reason: string;
    created_by: string;
    created_at: string;
  }[] = [];
  if (baseSession.status === "LOCKED" && lineIds.length > 0) {
    const { data: adjRows, error: adjError } = await admin
      .from("adjustments")
      .select("id, count_line_id, previous_qty, new_qty, reason, created_by, created_at")
      .in("count_line_id", lineIds)
      .order("created_at");
    if (adjError) throw new Error(adjError.message);
    rawAdjustments = adjRows ?? [];
  }

  const nameById = await namesByProfileId(admin, [
    sessionRow.counted_by,
    sessionRow.finished_by,
    sessionRow.locked_by,
    ...mismatches.map((r) => r.reason_set_by),
    ...mismatches.map((r) => r.book_diff_reason_set_by),
    ...rawAdjustments.map((a) => a.created_by),
  ]);

  const adjustmentsByLine = new Map<string, PostLockAdjustment[]>();
  for (const a of rawAdjustments) {
    const list = adjustmentsByLine.get(a.count_line_id) ?? [];
    list.push({
      id: a.id,
      previousQty: a.previous_qty,
      newQty: a.new_qty,
      reason: a.reason,
      createdByName: nameById.get(a.created_by) ?? "—",
      createdAt: a.created_at,
    });
    adjustmentsByLine.set(a.count_line_id, list);
  }

  const lines: ReconcileLine[] = mismatches.map((r) => {
    const variance = (r.physical_qty ?? 0) - r.expected_qty;
    const bookDiffers = r.ledger_qty != null && r.ledger_qty !== r.expected_qty;
    const unitCost = r.products!.unit_cost;
    const varianceReasonRequiresNote = r.reason_code_id ? requiresNoteById.get(r.reason_code_id) ?? false : false;
    const bookDiffReasonRequiresNote = r.book_diff_reason_code_id ? requiresNoteById.get(r.book_diff_reason_code_id) ?? false : false;
    return {
      id: r.id,
      productId: r.product_id,
      code: r.products!.code,
      name: r.products!.name,
      shelfOrder: shelfByProduct.get(r.product_id) ?? null,
      expectedQty: r.expected_qty,
      countedQty: r.physical_qty ?? 0,
      ledgerQty: r.ledger_qty,
      unitCost,
      variance,
      value: variance !== 0 ? Math.abs(variance) * unitCost : 0,
      flag: variance < 0 ? "short" : "excess",
      bookDiffers,
      reasonCodeId: r.reason_code_id,
      note: r.note,
      reasonSetByName: r.reason_set_by ? nameById.get(r.reason_set_by) ?? null : null,
      reasonSetAt: r.reason_set_at,
      bookDiffReasonCodeId: r.book_diff_reason_code_id,
      bookDiffNote: r.book_diff_note,
      bookDiffReasonSetByName: r.book_diff_reason_set_by ? nameById.get(r.book_diff_reason_set_by) ?? null : null,
      bookDiffReasonSetAt: r.book_diff_reason_set_at,
      isVarianceReasoned: variance === 0 || (!!r.reason_code_id && (!varianceReasonRequiresNote || !!r.note?.trim())),
      isBookDiffReasoned: !bookDiffers || (!!r.book_diff_reason_code_id && (!bookDiffReasonRequiresNote || !!r.book_diff_note?.trim())),
      adjustments: adjustmentsByLine.get(r.id) ?? [],
    };
  });
  lines.sort((a, b) => (a.shelfOrder ?? Infinity) - (b.shelfOrder ?? Infinity));

  const reconciled = lines.filter((l) => l.isVarianceReasoned && l.isBookDiffReasoned).length;

  return {
    session: {
      ...baseSession,
      countedByName: nameById.get(sessionRow.counted_by) ?? "—",
      finishedAt: sessionRow.finished_at,
      finishedByName: sessionRow.finished_by ? nameById.get(sessionRow.finished_by) ?? null : null,
      lockedAt: sessionRow.locked_at,
      lockedByName: sessionRow.locked_by ? nameById.get(sessionRow.locked_by) ?? null : null,
    },
    lines,
    progress: { reconciled, total: lines.length },
  };
}

// ============================================================================
// ATTACH A REASON — pre-lock only (the count_lines_lock_guard trigger would
// reject the update anyway once LOCKED; these checks give a friendly error
// instead of a raw database exception).
// ============================================================================

async function assertReasonUsable(admin: AdminClient, reasonCodeId: string, allowedApplies: ("VARIANCE" | "BOOK_DIFF")[]) {
  const { data: reasonCode, error } = await admin
    .from("reason_codes")
    .select("applies_to, requires_note, is_active")
    .eq("id", reasonCodeId)
    .single();
  if (error || !reasonCode) throw new Error("Reason code not found.");
  if (!reasonCode.is_active) throw new Error("This reason has been retired — choose an active one.");
  if (reasonCode.applies_to !== "BOTH" && !allowedApplies.includes(reasonCode.applies_to as "VARIANCE" | "BOOK_DIFF")) {
    throw new Error("That reason doesn't apply here.");
  }
  return reasonCode;
}

async function loadLineSession(admin: AdminClient, countLineId: string) {
  const { data: line, error } = await admin.from("count_lines").select("count_session_id").eq("id", countLineId).single();
  if (error || !line) throw new Error("Count line not found.");
  const { data: session, error: sessionError } = await admin
    .from("count_sessions")
    .select("id, status")
    .eq("id", line.count_session_id)
    .single();
  if (sessionError || !session) throw new Error("Count session not found.");
  return session;
}

export async function setVarianceReason(countLineId: string, reasonCodeId: string, note: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadLineSession(admin, countLineId);
  if (session.status === "LOCKED") throw new Error("This session is locked — reasons can no longer be changed.");
  if (session.status === "DRAFT") throw new Error("Finish the count before reconciling.");

  const reasonCode = await assertReasonUsable(admin, reasonCodeId, ["VARIANCE"]);
  const trimmedNote = note.trim();
  if (reasonCode.requires_note && !trimmedNote) throw new Error('This reason requires a note.');

  const { error } = await admin
    .from("count_lines")
    .update({ reason_code_id: reasonCodeId, note: trimmedNote || null, reason_set_by: profile.id, reason_set_at: new Date().toISOString() })
    .eq("id", countLineId);
  if (error) throw new Error(error.message);

  revalidatePath(`/reconcile/${session.id}`);
}

export async function setBookDiffReason(countLineId: string, reasonCodeId: string, note: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadLineSession(admin, countLineId);
  if (session.status === "LOCKED") throw new Error("This session is locked — reasons can no longer be changed.");
  if (session.status === "DRAFT") throw new Error("Finish the count before reconciling.");

  const reasonCode = await assertReasonUsable(admin, reasonCodeId, ["BOOK_DIFF"]);
  const trimmedNote = note.trim();
  if (reasonCode.requires_note && !trimmedNote) throw new Error('This reason requires a note.');

  const { error } = await admin
    .from("count_lines")
    .update({
      book_diff_reason_code_id: reasonCodeId,
      book_diff_note: trimmedNote || null,
      book_diff_reason_set_by: profile.id,
      book_diff_reason_set_at: new Date().toISOString(),
    })
    .eq("id", countLineId);
  if (error) throw new Error(error.message);

  revalidatePath(`/reconcile/${session.id}`);
}

// ============================================================================
// LOCK — re-validated entirely server-side inside lock_count_session; the
// client-side progress check is only ever a friendly early warning.
// ============================================================================

export async function lockCountSession(sessionId: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("lock_count_session", { p_session_id: sessionId, p_locked_by: profile.id });
  if (error) throw new Error(error.message);

  revalidatePath(`/reconcile/${sessionId}`);
  revalidatePath(`/compare/${sessionId}`);
  revalidatePath("/sessions");
  revalidatePath("/reconcile");
  return data;
}

// ============================================================================
// POST-LOCK ADJUSTMENT — append-only; never rewrites the certified figure.
// ============================================================================

export async function raisePostLockAdjustment(countLineId: string, newQty: number, reason: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to raise a post-lock adjustment.");
  if (!Number.isInteger(newQty) || newQty < 0) throw new Error("The adjusted quantity must be zero or a positive whole number.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_post_lock_adjustment", {
    p_count_line_id: countLineId,
    p_new_qty: newQty,
    p_reason: trimmed,
    p_created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  const { data: line } = await admin.from("count_lines").select("count_session_id").eq("id", countLineId).single();
  if (line) revalidatePath(`/reconcile/${line.count_session_id}`);
  return data;
}

// ============================================================================
// FULL AUDIT TRAIL — everything that ever happened to a session, in order.
// ============================================================================

export type AuditEvent = {
  at: string;
  actorName: string | null;
  kind: "created" | "finished" | "reason" | "locked" | "adjustment" | "post-lock-adjustment";
  description: string;
};

export async function getSessionAuditTrail(sessionId: string): Promise<AuditEvent[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("count_sessions")
    .select("as_at_date, created_at, counted_by, finished_at, finished_by, locked_at, locked_by, departments(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) throw new Error("Count session not found.");

  const { data: lines } = await admin
    .from("count_lines")
    .select(
      "id, reason_code_id, reason_set_by, reason_set_at, note, book_diff_reason_code_id, book_diff_reason_set_by, book_diff_reason_set_at, book_diff_note, products(code, name)"
    )
    .eq("count_session_id", sessionId);

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: adjustments } =
    lineIds.length > 0
      ? await admin
          .from("adjustments")
          .select("count_line_id, previous_qty, new_qty, reason, created_by, created_at")
          .in("count_line_id", lineIds)
          .order("created_at")
      : { data: [] };

  const reasonCodeIds = new Set<string>();
  for (const l of lines ?? []) {
    if (l.reason_code_id) reasonCodeIds.add(l.reason_code_id);
    if (l.book_diff_reason_code_id) reasonCodeIds.add(l.book_diff_reason_code_id);
  }
  const { data: reasonCodes } =
    reasonCodeIds.size > 0 ? await admin.from("reason_codes").select("id, label").in("id", Array.from(reasonCodeIds)) : { data: [] };
  const labelById = new Map((reasonCodes ?? []).map((r) => [r.id, r.label]));

  const nameById = await namesByProfileId(admin, [
    session.counted_by,
    session.finished_by,
    session.locked_by,
    ...(lines ?? []).map((l) => l.reason_set_by),
    ...(lines ?? []).map((l) => l.book_diff_reason_set_by),
    ...(adjustments ?? []).map((a) => a.created_by),
  ]);

  const events: AuditEvent[] = [
    {
      at: session.created_at,
      actorName: nameById.get(session.counted_by) ?? null,
      kind: "created",
      description: `Count session created for ${session.departments?.name ?? "—"}, as at ${session.as_at_date}.`,
    },
  ];

  if (session.finished_at) {
    events.push({
      at: session.finished_at,
      actorName: session.finished_by ? nameById.get(session.finished_by) ?? null : null,
      kind: "finished",
      description: "Count finished — expected figures frozen.",
    });
  }

  for (const l of lines ?? []) {
    if (l.reason_set_at) {
      events.push({
        at: l.reason_set_at,
        actorName: l.reason_set_by ? nameById.get(l.reason_set_by) ?? null : null,
        kind: "reason",
        description: `${l.products!.name} (${l.products!.code}): variance reason set to "${
          l.reason_code_id ? labelById.get(l.reason_code_id) ?? "—" : "—"
        }"${l.note ? ` — ${l.note}` : ""}.`,
      });
    }
    if (l.book_diff_reason_set_at) {
      events.push({
        at: l.book_diff_reason_set_at,
        actorName: l.book_diff_reason_set_by ? nameById.get(l.book_diff_reason_set_by) ?? null : null,
        kind: "reason",
        description: `${l.products!.name} (${l.products!.code}): book-difference reason set to "${
          l.book_diff_reason_code_id ? labelById.get(l.book_diff_reason_code_id) ?? "—" : "—"
        }"${l.book_diff_note ? ` — ${l.book_diff_note}` : ""}.`,
      });
    }
  }

  if (session.locked_at) {
    events.push({
      at: session.locked_at,
      actorName: session.locked_by ? nameById.get(session.locked_by) ?? null : null,
      kind: "locked",
      description: "Session locked — figures certified and permanent.",
    });
  }

  const lineById = new Map((lines ?? []).map((l) => [l.id, l]));
  for (const a of adjustments ?? []) {
    const line = lineById.get(a.count_line_id);
    const isPostLock = !!session.locked_at && new Date(a.created_at).getTime() > new Date(session.locked_at).getTime();
    events.push({
      at: a.created_at,
      actorName: nameById.get(a.created_by) ?? null,
      kind: isPostLock ? "post-lock-adjustment" : "adjustment",
      description: `${line?.products?.name ?? "Product"}${line?.products?.code ? ` (${line.products.code})` : ""}: ${a.previous_qty} → ${
        a.new_qty
      } (${a.reason})${isPostLock ? " — post-lock adjustment" : ""}.`,
    });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return events;
}

// ============================================================================
// REPORTING — variances by reason code, and the standing "under
// investigation" list. Single-consumer aggregations, computed in application
// code rather than a new DB view (SPEC.md phase 6 has no other caller).
// ============================================================================

export type ReportFilters = { departmentId?: string; from?: string; to?: string };

export type ReasonReportRow = {
  reasonCodeId: string;
  label: string;
  lineCount: number;
  totalQuantity: number;
  // null (not zero) for book-difference rows — a ledger mismatch has no
  // defensible currency value, same reasoning as Compare's "—" (SPEC.md).
  totalValue: number | null;
};

export async function getVarianceByReasonReport(
  filters: ReportFilters
): Promise<{ varianceRows: ReasonReportRow[]; bookDiffRows: ReasonReportRow[] }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  let sessionQuery = admin.from("count_sessions").select("id").in("status", ["COMPLETED", "LOCKED"]);
  if (filters.departmentId) sessionQuery = sessionQuery.eq("department_id", filters.departmentId);
  if (filters.from) sessionQuery = sessionQuery.gte("as_at_date", filters.from);
  if (filters.to) sessionQuery = sessionQuery.lte("as_at_date", filters.to);
  const { data: sessions, error: sessionsError } = await sessionQuery;
  if (sessionsError) throw new Error(sessionsError.message);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return { varianceRows: [], bookDiffRows: [] };

  const { data: lines, error } = await admin
    .from("count_lines")
    .select("expected_qty, physical_qty, ledger_qty, reason_code_id, book_diff_reason_code_id, products(unit_cost)")
    .in("count_session_id", sessionIds);
  if (error) throw new Error(error.message);

  const { data: reasonCodes } = await admin.from("reason_codes").select("id, label");
  const labelById = new Map((reasonCodes ?? []).map((r) => [r.id, r.label]));

  const varianceAgg = new Map<string, { lineCount: number; totalQuantity: number; totalValue: number }>();
  const bookDiffAgg = new Map<string, { lineCount: number; totalQuantity: number }>();

  for (const l of lines ?? []) {
    const variance = (l.physical_qty ?? 0) - l.expected_qty;
    if (variance !== 0 && l.reason_code_id) {
      const entry = varianceAgg.get(l.reason_code_id) ?? { lineCount: 0, totalQuantity: 0, totalValue: 0 };
      entry.lineCount += 1;
      entry.totalQuantity += variance;
      entry.totalValue += variance * (l.products?.unit_cost ?? 0);
      varianceAgg.set(l.reason_code_id, entry);
    }
    if (l.ledger_qty != null && l.ledger_qty !== l.expected_qty && l.book_diff_reason_code_id) {
      const entry = bookDiffAgg.get(l.book_diff_reason_code_id) ?? { lineCount: 0, totalQuantity: 0 };
      entry.lineCount += 1;
      entry.totalQuantity += l.ledger_qty - l.expected_qty;
      bookDiffAgg.set(l.book_diff_reason_code_id, entry);
    }
  }

  const varianceRows: ReasonReportRow[] = Array.from(varianceAgg.entries())
    .map(([id, v]) => ({ reasonCodeId: id, label: labelById.get(id) ?? "—", lineCount: v.lineCount, totalQuantity: v.totalQuantity, totalValue: v.totalValue }))
    .sort((a, b) => b.lineCount - a.lineCount);
  const bookDiffRows: ReasonReportRow[] = Array.from(bookDiffAgg.entries())
    .map(([id, v]) => ({ reasonCodeId: id, label: labelById.get(id) ?? "—", lineCount: v.lineCount, totalQuantity: v.totalQuantity, totalValue: null }))
    .sort((a, b) => b.lineCount - a.lineCount);

  return { varianceRows, bookDiffRows };
}

export type UnderInvestigationLine = {
  countLineId: string;
  sessionId: string;
  departmentName: string;
  asAtDate: string;
  sessionStatus: SessionStatus;
  code: string;
  name: string;
  kind: "variance" | "book_diff";
  expectedQty: number;
  countedQty: number;
  ledgerQty: number | null;
  variance: number;
  note: string | null;
};

export async function getUnderInvestigationLines(filters: { departmentId?: string } = {}): Promise<UnderInvestigationLine[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data: uiCode } = await admin.from("reason_codes").select("id").eq("code", "UNDER_INVESTIGATION").maybeSingle();
  if (!uiCode) return [];

  const { data: rows, error } = await admin
    .from("count_lines")
    .select(
      "id, count_session_id, expected_qty, physical_qty, ledger_qty, reason_code_id, note, book_diff_reason_code_id, book_diff_note, products(code, name), count_sessions(as_at_date, status, department_id, departments(name))"
    )
    .or(`reason_code_id.eq.${uiCode.id},book_diff_reason_code_id.eq.${uiCode.id}`);
  if (error) throw new Error(error.message);

  const filtered = (rows ?? []).filter((r) => !filters.departmentId || r.count_sessions?.department_id === filters.departmentId);

  const result: UnderInvestigationLine[] = [];
  for (const r of filtered) {
    const variance = (r.physical_qty ?? 0) - r.expected_qty;
    const base = {
      countLineId: r.id,
      sessionId: r.count_session_id,
      departmentName: r.count_sessions?.departments?.name ?? "—",
      asAtDate: r.count_sessions?.as_at_date ?? "",
      sessionStatus: (r.count_sessions?.status ?? "COMPLETED") as SessionStatus,
      code: r.products!.code,
      name: r.products!.name,
      expectedQty: r.expected_qty,
      countedQty: r.physical_qty ?? 0,
      ledgerQty: r.ledger_qty,
      variance,
    };
    if (r.reason_code_id === uiCode.id) {
      result.push({ ...base, kind: "variance", note: r.note });
    }
    if (r.book_diff_reason_code_id === uiCode.id) {
      result.push({ ...base, kind: "book_diff", note: r.book_diff_note });
    }
  }
  result.sort((a, b) => (a.asAtDate < b.asAtDate ? 1 : -1));
  return result;
}

// ============================================================================
// REPEAT VARIANCES — "the finding that one-off screens can't show" (SPEC.md
// phase 7): every product/department pair with a variance across more than
// one finished session in the chosen range, full list (not the dashboard's
// top-10 teaser), sortable, with a per-product session-by-session drill-down.
// Same application-code aggregation as the dashboard's own getRepeatVariances
// (CLAUDE.md's phase-6 precedent: single-consumer report, no new view) —
// this just widens the range/filters and drops the cap.
// ============================================================================

export type RepeatVarianceReportRow = {
  productId: string;
  productCode: string;
  productName: string;
  departmentId: string;
  departmentName: string;
  occurrences: number;
  totalVariance: number;
  totalValue: number;
};

export async function getRepeatVarianceReport(filters: {
  departmentId?: string;
  from: string;
  to: string;
  sort?: "occurrences" | "value";
}): Promise<RepeatVarianceReportRow[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  let sessionQuery = admin
    .from("count_sessions")
    .select("id, department_id, departments(name)")
    .in("status", ["COMPLETED", "LOCKED"])
    .gte("as_at_date", filters.from)
    .lte("as_at_date", filters.to);
  if (filters.departmentId) sessionQuery = sessionQuery.eq("department_id", filters.departmentId);
  const { data: sessions, error: sessionsError } = await sessionQuery;
  if (sessionsError) throw new Error(sessionsError.message);
  if (!sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const deptBySession = new Map(sessions.map((s) => [s.id, { id: s.department_id, name: s.departments?.name ?? "—" }]));

  const { data: lines, error } = await admin
    .from("count_lines")
    .select("count_session_id, product_id, physical_qty, expected_qty, products(code, name, unit_cost)")
    .in("count_session_id", sessionIds);
  if (error) throw new Error(error.message);

  const agg = new Map<string, RepeatVarianceReportRow>();
  for (const l of lines ?? []) {
    const variance = (l.physical_qty ?? 0) - l.expected_qty;
    if (variance === 0) continue;
    const dept = deptBySession.get(l.count_session_id);
    if (!dept) continue;
    const key = `${l.product_id}:${dept.id}`;
    const entry = agg.get(key) ?? {
      productId: l.product_id,
      productCode: l.products!.code,
      productName: l.products!.name,
      departmentId: dept.id,
      departmentName: dept.name,
      occurrences: 0,
      totalVariance: 0,
      totalValue: 0,
    };
    entry.occurrences += 1;
    entry.totalVariance += variance;
    entry.totalValue += Math.abs(variance) * l.products!.unit_cost;
    agg.set(key, entry);
  }

  const rows = Array.from(agg.values()).filter((r) => r.occurrences >= 2);
  const sortKey = filters.sort ?? "occurrences";
  rows.sort((a, b) => (sortKey === "value" ? b.totalValue - a.totalValue : b.occurrences - a.occurrences));
  return rows;
}

export type RepeatVarianceSessionRow = {
  sessionId: string;
  asAtDate: string;
  status: SessionStatus;
  expectedQty: number;
  countedQty: number;
  variance: number;
  value: number;
};

export async function getRepeatVarianceProductHistory(input: {
  productId: string;
  departmentId: string;
  from: string;
  to: string;
}): Promise<{ productCode: string; productName: string; departmentName: string; rows: RepeatVarianceSessionRow[] }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data: sessions, error: sessionsError } = await admin
    .from("count_sessions")
    .select("id, as_at_date, status, departments(name)")
    .eq("department_id", input.departmentId)
    .in("status", ["COMPLETED", "LOCKED"])
    .gte("as_at_date", input.from)
    .lte("as_at_date", input.to)
    .order("as_at_date", { ascending: false });
  if (sessionsError) throw new Error(sessionsError.message);
  if (!sessions || sessions.length === 0) return { productCode: "", productName: "", departmentName: "—", rows: [] };

  const sessionIds = sessions.map((s) => s.id);
  const { data: lines, error } = await admin
    .from("count_lines")
    .select("count_session_id, physical_qty, expected_qty, products(code, name, unit_cost)")
    .eq("product_id", input.productId)
    .in("count_session_id", sessionIds);
  if (error) throw new Error(error.message);

  const lineBySession = new Map((lines ?? []).map((l) => [l.count_session_id, l]));
  let productCode = "";
  let productName = "";

  const rows: RepeatVarianceSessionRow[] = [];
  for (const s of sessions) {
    const line = lineBySession.get(s.id);
    if (!line) continue;
    productCode = line.products!.code;
    productName = line.products!.name;
    const variance = (line.physical_qty ?? 0) - line.expected_qty;
    if (variance === 0) continue;
    rows.push({
      sessionId: s.id,
      asAtDate: s.as_at_date,
      status: s.status,
      expectedQty: line.expected_qty,
      countedQty: line.physical_qty ?? 0,
      variance,
      value: Math.abs(variance) * line.products!.unit_cost,
    });
  }

  return { productCode, productName, departmentName: sessions[0]?.departments?.name ?? "—", rows };
}

// ============================================================================
// PERIOD SUMMARY — one department, one chosen date range: total purchases/
// received value, total issued/sold value, opening/closing stock value, and
// variance value + breakdown by reason. All computed straight from
// get_department_balance (period boundaries) and a direct movements sum
// (period activity), never a stored total — same "no new stored totals"
// principle as every other report this phase (SPEC.md).
// ============================================================================

export type PeriodSummary = {
  departmentId: string;
  departmentName: string;
  isCentralStore: boolean;
  from: string;
  to: string;
  openingValue: number;
  closingValue: number;
  receivedValue: number;
  issuedValue: number;
  varianceValue: number;
  varianceLineCount: number;
  varianceRows: ReasonReportRow[];
  bookDiffRows: ReasonReportRow[];
};

export async function getPeriodSummary(input: { departmentId: string; from: string; to: string }): Promise<PeriodSummary> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data: dept, error: deptError } = await admin
    .from("departments")
    .select("id, name, is_central_store")
    .eq("id", input.departmentId)
    .single();
  if (deptError || !dept) throw new Error(deptError?.message ?? "Department not found.");

  const [openingBalance, closingBalance] = await Promise.all([
    admin.rpc("get_department_balance", { p_department_id: input.departmentId, p_as_at_date: input.from }),
    admin.rpc("get_department_balance", { p_department_id: input.departmentId, p_as_at_date: input.to }),
  ]);
  if (openingBalance.error) throw new Error(openingBalance.error.message);
  if (closingBalance.error) throw new Error(closingBalance.error.message);
  const openingValue = (openingBalance.data ?? []).reduce((s, r) => s + r.opening_value, 0);
  const closingValue = (closingBalance.data ?? []).reduce((s, r) => s + r.closing_value, 0);

  // Period activity (every day in range, not just the boundary dates): a
  // direct movements sum, mirroring get_department_balance's own inbound/
  // outbound convention — OPENING never counts as "received" (SPEC.md's
  // opening-balance model), and a reversal nets negative in the same branch
  // its original counted in.
  const { data: movements, error: movementsError } = await admin
    .from("movements")
    .select("type, quantity, from_department_id, to_department_id, reversal_of_movement_id, product_id, products(unit_cost)")
    .gte("business_day", input.from)
    .lte("business_day", input.to)
    .or(`from_department_id.eq.${input.departmentId},to_department_id.eq.${input.departmentId}`);
  if (movementsError) throw new Error(movementsError.message);

  let receivedValue = 0;
  let issuedValue = 0;
  for (const m of movements ?? []) {
    const signedQty = m.reversal_of_movement_id ? -m.quantity : m.quantity;
    const value = signedQty * (m.products?.unit_cost ?? 0);
    if (m.to_department_id === input.departmentId && m.type !== "OPENING") receivedValue += value;
    if (m.from_department_id === input.departmentId) issuedValue += value;
  }

  const sessionQuery = admin
    .from("count_sessions")
    .select("id")
    .eq("department_id", input.departmentId)
    .in("status", ["COMPLETED", "LOCKED"])
    .gte("as_at_date", input.from)
    .lte("as_at_date", input.to);
  const { data: sessions, error: sessionsError } = await sessionQuery;
  if (sessionsError) throw new Error(sessionsError.message);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  let varianceValue = 0;
  let varianceLineCount = 0;
  if (sessionIds.length > 0) {
    const { data: lines, error: linesError } = await admin
      .from("count_lines")
      .select("physical_qty, expected_qty, products(unit_cost)")
      .in("count_session_id", sessionIds);
    if (linesError) throw new Error(linesError.message);
    for (const l of lines ?? []) {
      const variance = (l.physical_qty ?? 0) - l.expected_qty;
      if (variance === 0) continue;
      varianceLineCount += 1;
      varianceValue += variance * (l.products?.unit_cost ?? 0);
    }
  }

  const { varianceRows, bookDiffRows } = await getVarianceByReasonReport({ departmentId: input.departmentId, from: input.from, to: input.to });

  return {
    departmentId: dept.id,
    departmentName: dept.name,
    isCentralStore: dept.is_central_store,
    from: input.from,
    to: input.to,
    openingValue,
    closingValue,
    receivedValue,
    issuedValue,
    varianceValue,
    varianceLineCount,
    varianceRows,
    bookDiffRows,
  };
}
