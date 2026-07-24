"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
export type SessionStatus = Database["public"]["Enums"]["session_status"];

export type SessionMeta = {
  id: string;
  departmentId: string;
  departmentName: string;
  asAtDate: string;
  status: SessionStatus;
  updatedAt: string;
};

async function loadSessionMeta(admin: AdminClient, sessionId: string): Promise<SessionMeta> {
  const { data, error } = await admin
    .from("count_sessions")
    .select("id, department_id, as_at_date, status, updated_at, departments(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Count session not found.");
  return {
    id: data.id,
    departmentId: data.department_id,
    departmentName: data.departments?.name ?? "—",
    asAtDate: data.as_at_date,
    status: data.status,
    updatedAt: data.updated_at,
  };
}

function sortByShelf<T extends { shelfOrder: number | null; name: string }>(a: T, b: T) {
  if (a.shelfOrder == null && b.shelfOrder == null) return a.name.localeCompare(b.name);
  if (a.shelfOrder == null) return 1;
  if (b.shelfOrder == null) return -1;
  return a.shelfOrder - b.shelfOrder;
}

// Shared shape behind both the take-stock (physical_qty) and ledger-record
// (ledger_qty) screens — same product list, same shelf order, same input
// pattern, differing only in which nullable column is being recorded.
// Deliberately never selects expected_qty: this is the one query both of
// those screens are built on, so the omission is what makes blind counting
// structural rather than a "just don't render it" convention.
async function loadShelfOrderedLines(admin: AdminClient, sessionId: string, departmentId: string, valueColumn: "physical_qty" | "ledger_qty") {
  const { data: lines, error } = await admin
    .from("count_lines")
    .select(`id, product_id, ${valueColumn}, products(code, name)`)
    .eq("count_session_id", sessionId);
  if (error) throw new Error(error.message);

  const { data: assignments, error: assignError } = await admin
    .from("product_assignments")
    .select("product_id, shelf_order")
    .eq("department_id", departmentId);
  if (assignError) throw new Error(assignError.message);
  const shelfByProduct = new Map((assignments ?? []).map((a) => [a.product_id, a.shelf_order]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (lines ?? []).map((l: any) => ({
    id: l.id as string,
    productId: l.product_id as string,
    code: l.products.code as string,
    name: l.products.name as string,
    shelfOrder: (shelfByProduct.get(l.product_id) ?? null) as number | null,
    value: l[valueColumn] as number | null,
  })).sort(sortByShelf);
}

// ============================================================================
// DEPARTMENT PICKER — every active department, INCLUDING the central store.
// Unlike Sales/Requisitions (which exclude it), the central store is counted
// too: "closing = opening + purchases − requisitions out" (SPEC.md).
// ============================================================================

export async function listCountDepartments() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data, error } = await admin.from("departments").select("id, name, is_central_store").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ============================================================================
// START OR OPEN A SESSION
// ============================================================================

export async function startOrOpenCountSession(departmentId: string, asAtDate: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  if (!departmentId) throw new Error("Choose a department.");
  if (!asAtDate) throw new Error("Choose an as-at date.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_or_open_count_session", {
    p_department_id: departmentId,
    p_as_at_date: asAtDate,
    p_counted_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/sessions");
  revalidatePath("/compare");
  return { id: data.id, status: data.status as SessionStatus };
}

export async function getCountSessionMeta(sessionId: string): Promise<SessionMeta> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);
  const admin = createAdminClient();
  return loadSessionMeta(admin, sessionId);
}

// ============================================================================
// TAKE STOCK (physical count) — the blind-counting screen. Never returns
// expected_qty, in either this call path or the one below it.
// ============================================================================

export type CountingLine = {
  id: string;
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  physicalQty: number | null;
};

export async function getCountLinesForCounting(sessionId: string): Promise<{ session: SessionMeta; lines: CountingLine[] }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadSessionMeta(admin, sessionId);
  const raw = await loadShelfOrderedLines(admin, sessionId, session.departmentId, "physical_qty");
  const lines: CountingLine[] = raw.map((l) => ({
    id: l.id,
    productId: l.productId,
    code: l.code,
    name: l.name,
    shelfOrder: l.shelfOrder,
    physicalQty: l.value,
  }));
  return { session, lines };
}

export type CountEntryInput = { productId: string; physicalQty: number | null };

export async function saveCountEntries(sessionId: string, entries: CountEntryInput[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadSessionMeta(admin, sessionId);
  if (session.status !== "DRAFT") {
    throw new Error("This count has already been finished — corrections happen from Compare stock.");
  }
  if (entries.length === 0) return { savedAt: new Date().toISOString() };

  for (const e of entries) {
    if (e.physicalQty != null && (!Number.isInteger(e.physicalQty) || e.physicalQty < 0)) {
      throw new Error("Counted quantity must be zero or a positive whole number.");
    }
  }

  const { error } = await admin
    .from("count_lines")
    .upsert(
      entries.map((e) => ({ count_session_id: sessionId, product_id: e.productId, physical_qty: e.physicalQty })),
      { onConflict: "count_session_id,product_id" }
    );
  if (error) throw new Error(error.message);

  const savedAt = new Date().toISOString();
  await admin.from("count_sessions").update({ updated_at: savedAt }).eq("id", sessionId);

  return { savedAt };
}

export async function finishCountSession(sessionId: string, zeroFillBlanks: boolean) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("finish_count_session", {
    p_session_id: sessionId,
    p_zero_fill_blanks: zeroFillBlanks,
    p_finished_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/count/${sessionId}`);
  revalidatePath(`/compare/${sessionId}`);
  revalidatePath("/sessions");
  revalidatePath("/compare");
  revalidatePath("/");
  return data;
}

// ============================================================================
// LEDGER RECORD — optional second pass, available once the count is finished.
// Same shape as counting, recording ledger_qty instead of physical_qty.
// ============================================================================

export type LedgerLine = {
  id: string;
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  ledgerQty: number | null;
};

export async function getLedgerLinesForRecording(sessionId: string): Promise<{ session: SessionMeta; lines: LedgerLine[] }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadSessionMeta(admin, sessionId);
  const raw = await loadShelfOrderedLines(admin, sessionId, session.departmentId, "ledger_qty");
  const lines: LedgerLine[] = raw.map((l) => ({
    id: l.id,
    productId: l.productId,
    code: l.code,
    name: l.name,
    shelfOrder: l.shelfOrder,
    ledgerQty: l.value,
  }));
  return { session, lines };
}

export type LedgerEntryInput = { productId: string; ledgerQty: number | null };

export async function saveLedgerEntries(sessionId: string, entries: LedgerEntryInput[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadSessionMeta(admin, sessionId);
  if (session.status === "DRAFT") throw new Error("Finish the count before recording ledger figures.");
  if (session.status === "LOCKED") throw new Error("This session is locked and read-only.");
  if (entries.length === 0) return { savedAt: new Date().toISOString() };

  for (const e of entries) {
    if (e.ledgerQty != null && (!Number.isInteger(e.ledgerQty) || e.ledgerQty < 0)) {
      throw new Error("Ledger quantity must be zero or a positive whole number.");
    }
  }

  const { error } = await admin
    .from("count_lines")
    .upsert(
      entries.map((e) => ({ count_session_id: sessionId, product_id: e.productId, ledger_qty: e.ledgerQty })),
      { onConflict: "count_session_id,product_id" }
    );
  if (error) throw new Error(error.message);

  const savedAt = new Date().toISOString();
  await admin.from("count_sessions").update({ updated_at: savedAt }).eq("id", sessionId);

  return { savedAt };
}

// ============================================================================
// COMPARE STOCK — the only call path that ever returns expected_qty, and
// only once a session is COMPLETED/LOCKED (expected_qty is a meaningless 0
// placeholder before finish_count_session runs — see the migration header).
//
// Flag rules (SPEC.md's "three-figure case" — kept as two independent facts,
// deliberately not collapsed into one "variance" concept):
//   - primary: counted vs. expected. counted < expected -> short (red);
//     counted > expected -> excess (green); equal -> no primary flag.
//   - bookDiffers (secondary, independent): a ledger figure was recorded and
//     it disagrees with the frozen expected figure. This is what flags the
//     prototype's Eva Water case (counted == expected, ledger != expected)
//     as "Book differs" rather than a shortage, AND is shown ALONGSIDE a
//     primary short/excess flag on the rarer three-way-mismatch line, per
//     "flag it distinctly and let me see all three figures side by side."
// A line is hidden (tallies) only when neither fact holds.
// ============================================================================

export type CompareFlag = "short" | "excess" | "tally";

export type CompareLine = {
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
  flag: CompareFlag;
  bookDiffers: boolean;
};

export type CompareSummary = {
  productsCounted: number;
  tallyCount: number;
  varianceCount: number;
  netVarianceValue: number;
};

export async function getCompareData(sessionId: string): Promise<{ session: SessionMeta; lines: CompareLine[]; summary: CompareSummary }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const session = await loadSessionMeta(admin, sessionId);
  if (session.status === "DRAFT") {
    throw new Error("Finish the count before comparing.");
  }

  const { data: rows, error } = await admin
    .from("count_lines")
    .select("id, product_id, expected_qty, physical_qty, ledger_qty, products(code, name, unit_cost)")
    .eq("count_session_id", sessionId);
  if (error) throw new Error(error.message);

  const { data: assignments, error: assignError } = await admin
    .from("product_assignments")
    .select("product_id, shelf_order")
    .eq("department_id", session.departmentId);
  if (assignError) throw new Error(assignError.message);
  const shelfByProduct = new Map((assignments ?? []).map((a) => [a.product_id, a.shelf_order]));

  const lines: CompareLine[] = (rows ?? []).map((l) => {
    const expected = l.expected_qty;
    const counted = l.physical_qty ?? 0;
    const ledger = l.ledger_qty;
    const variance = counted - expected;
    const unitCost = l.products!.unit_cost;
    const bookDiffers = ledger != null && ledger !== expected;
    const flag: CompareFlag = variance < 0 ? "short" : variance > 0 ? "excess" : "tally";
    return {
      id: l.id,
      productId: l.product_id,
      code: l.products!.code,
      name: l.products!.name,
      shelfOrder: shelfByProduct.get(l.product_id) ?? null,
      expectedQty: expected,
      countedQty: counted,
      ledgerQty: ledger,
      unitCost,
      variance,
      value: variance !== 0 ? Math.abs(variance) * unitCost : 0,
      flag,
      bookDiffers,
    };
  });
  lines.sort(sortByShelf);

  const mismatches = lines.filter((l) => l.flag !== "tally" || l.bookDiffers);
  const netVarianceValue = lines.reduce((sum, l) => sum + l.variance * l.unitCost, 0);

  return {
    session,
    lines,
    summary: {
      productsCounted: lines.length,
      tallyCount: lines.length - mismatches.length,
      varianceCount: mismatches.length,
      netVarianceValue,
    },
  };
}

export async function correctCountEntry(countLineId: string, newQty: number, reason: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to correct a count entry.");
  if (!Number.isInteger(newQty) || newQty < 0) throw new Error("The corrected quantity must be zero or a positive whole number.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_count_adjustment", {
    p_count_line_id: countLineId,
    p_new_qty: newQty,
    p_reason: trimmed,
    p_created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/compare/${data.count_session_id}`);
  revalidatePath("/sessions");
  return data;
}

export async function listCompareRowsForExport(sessionId: string, includeAll: boolean): Promise<CompareLine[]> {
  const { lines } = await getCompareData(sessionId);
  return includeAll ? lines : lines.filter((l) => l.flag !== "tally" || l.bookDiffers);
}

// ============================================================================
// SESSION LIST — filterable index of every count session, and the source
// for /compare's "ready to compare" landing (filtered to COMPLETED/LOCKED).
// ============================================================================

export type CountSessionFilters = {
  departmentId?: string;
  asAtFrom?: string;
  asAtTo?: string;
  statuses?: SessionStatus[];
  productSearch?: string;
};

export type CountSessionRow = {
  id: string;
  departmentId: string;
  departmentName: string;
  asAtDate: string;
  countedByName: string;
  status: SessionStatus;
  productCount: number;
  countedCount: number;
  varianceCount: number | null;
  varianceValue: number | null;
};

const SESSIONS_PAGE_SIZE = 50;

// Product search (History's addition to the phase-5 session list, SPEC.md's
// "search by product"): resolved to a session-id allowlist in application
// code, same shape as the dashboard's own aggregations, rather than a new
// view — count_sessions_summary is session-level and has no product column
// to filter on directly.
async function sessionIdsMatchingProduct(admin: AdminClient, query: string): Promise<string[] | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const { data: products, error: productError } = await admin
    .from("products")
    .select("id")
    .or(`code.ilike.%${trimmed}%,name.ilike.%${trimmed}%`);
  if (productError) throw new Error(productError.message);
  const productIds = (products ?? []).map((p) => p.id);
  if (productIds.length === 0) return [];

  const { data: lines, error: lineError } = await admin.from("count_lines").select("count_session_id").in("product_id", productIds);
  if (lineError) throw new Error(lineError.message);
  return Array.from(new Set((lines ?? []).map((l) => l.count_session_id)));
}

export async function listCountSessions(
  filters: CountSessionFilters,
  page: number
): Promise<{ rows: CountSessionRow[]; totalCount: number; page: number; totalPages: number }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();

  const matchingSessionIds = await sessionIdsMatchingProduct(admin, filters.productSearch ?? "");
  if (matchingSessionIds !== null && matchingSessionIds.length === 0) {
    return { rows: [], totalCount: 0, page: 1, totalPages: 1 };
  }

  let q = admin.from("count_sessions_summary").select("*", { count: "exact" });
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.asAtFrom) q = q.gte("as_at_date", filters.asAtFrom);
  if (filters.asAtTo) q = q.lte("as_at_date", filters.asAtTo);
  if (filters.statuses && filters.statuses.length > 0) q = q.in("status", filters.statuses);
  if (matchingSessionIds !== null) q = q.in("id", matchingSessionIds);

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * SESSIONS_PAGE_SIZE;
  const { data, count, error } = await q.order("as_at_date", { ascending: false }).range(from, from + SESSIONS_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / SESSIONS_PAGE_SIZE));

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id!,
      departmentId: r.department_id!,
      departmentName: r.department_name!,
      asAtDate: r.as_at_date!,
      countedByName: r.counted_by_name!,
      status: r.status!,
      productCount: r.product_count ?? 0,
      countedCount: r.counted_count ?? 0,
      varianceCount: r.variance_count,
      varianceValue: r.variance_value,
    })),
    totalCount,
    page: safePage,
    totalPages,
  };
}

const SESSIONS_EXPORT_CAP = 5000;

// Uncapped (well, capped generously — see EXPORT_ROW_CAP's precedent on
// lib/movements/actions.ts) read for History's CSV/PDF export: same filters
// as listCountSessions, no pagination.
export async function listCountSessionsForExport(filters: CountSessionFilters): Promise<CountSessionRow[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();

  const matchingSessionIds = await sessionIdsMatchingProduct(admin, filters.productSearch ?? "");
  if (matchingSessionIds !== null && matchingSessionIds.length === 0) return [];

  let q = admin.from("count_sessions_summary").select("*");
  if (filters.departmentId) q = q.eq("department_id", filters.departmentId);
  if (filters.asAtFrom) q = q.gte("as_at_date", filters.asAtFrom);
  if (filters.asAtTo) q = q.lte("as_at_date", filters.asAtTo);
  if (filters.statuses && filters.statuses.length > 0) q = q.in("status", filters.statuses);
  if (matchingSessionIds !== null) q = q.in("id", matchingSessionIds);

  const { data, error } = await q.order("as_at_date", { ascending: false }).limit(SESSIONS_EXPORT_CAP);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id!,
    departmentId: r.department_id!,
    departmentName: r.department_name!,
    asAtDate: r.as_at_date!,
    countedByName: r.counted_by_name!,
    status: r.status!,
    productCount: r.product_count ?? 0,
    countedCount: r.counted_count ?? 0,
    varianceCount: r.variance_count,
    varianceValue: r.variance_value,
  }));
}
