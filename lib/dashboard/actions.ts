"use server";

import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { yesterdayIso } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type SessionStatus = Database["public"]["Enums"]["session_status"];
type MovementType = Database["public"]["Enums"]["movement_type"];

export type DepartmentCountRow = {
  departmentId: string;
  departmentName: string;
  productCount: number;
  status: "NOT_STARTED" | SessionStatus;
  sessionId: string | null;
  countedCount: number | null;
  varianceCount: number | null;
  varianceValue: number | null;
};

export type LedgerRow = {
  departmentId: string;
  departmentName: string;
  openingValue: number;
  receivedValue: number;
  issuedValue: number;
  closingValue: number;
  productCount: number;
};

export type RepeatVarianceRow = {
  productId: string;
  productCode: string;
  productName: string;
  departmentId: string;
  departmentName: string;
  occurrences: number;
  totalVariance: number;
  totalValue: number;
};

export type RecentMovementRow = {
  id: string;
  type: MovementType;
  createdAt: string;
  detail: string;
  createdByName: string;
};

export type DashboardData = {
  businessDay: string;
  departmentRows: DepartmentCountRow[];
  ledgerRows: LedgerRow[];
  ledgerTotals: { openingValue: number; receivedValue: number; issuedValue: number; closingValue: number; productCount: number };
  stats: {
    countedDepartments: number;
    activeDepartments: number;
    varianceLineCount: number;
    varianceValue: number;
    awaitingReconciliation: number;
  };
  repeatVariances: RepeatVarianceRow[];
  recentMovements: RecentMovementRow[];
};

// Every figure below is a live query against the real schema — nothing here
// is a placeholder. ADMIN/AUDITOR see every department (SPEC.md's roles
// table), so there is no further role-based department scoping to apply;
// STOREKEEPER/DEPARTMENT_USER never reach this function — the page routes
// them to ScopedHome before calling it. `departmentId` is an optional
// user-chosen filter (the header select in design/ui-draft.html), narrowing
// every section below to one department — SPEC.md's "all figures scoped to
// the selected department filter."
export async function listDashboardDepartments() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { data, error } = await admin.from("departments").select("id, name").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDashboardData(departmentId?: string): Promise<DashboardData> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const businessDay = yesterdayIso();

  const { data: departments, error: deptError } = await admin.from("departments").select("id, name").eq("is_active", true).order("name");
  if (deptError) throw new Error(deptError.message);
  const activeDepartments = departmentId ? (departments ?? []).filter((d) => d.id === departmentId) : departments ?? [];

  const { data: assignments, error: assignError } = await admin.from("product_assignments").select("department_id");
  if (assignError) throw new Error(assignError.message);
  const productCountByDept = new Map<string, number>();
  for (const a of assignments ?? []) {
    productCountByDept.set(a.department_id, (productCountByDept.get(a.department_id) ?? 0) + 1);
  }

  const { data: sessions, error: sessionError } = await admin
    .from("count_sessions")
    .select("id, department_id, status")
    .eq("as_at_date", businessDay);
  if (sessionError) throw new Error(sessionError.message);
  const sessionByDept = new Map((sessions ?? []).map((s) => [s.department_id, s]));

  const draftSessionIds = (sessions ?? []).filter((s) => s.status === "DRAFT").map((s) => s.id);
  const finishedSessionIds = (sessions ?? []).filter((s) => s.status !== "DRAFT").map((s) => s.id);

  // Blind counting (SPEC.md): a DRAFT session's expected_qty must never be
  // fetched anywhere, even here — this query selects physical_qty only, so
  // there's nothing to leak.
  const countedByDraftSession = new Map<string, number>();
  if (draftSessionIds.length > 0) {
    const { data: draftLines, error } = await admin.from("count_lines").select("count_session_id, physical_qty").in("count_session_id", draftSessionIds);
    if (error) throw new Error(error.message);
    for (const l of draftLines ?? []) {
      if (l.physical_qty != null) {
        countedByDraftSession.set(l.count_session_id, (countedByDraftSession.get(l.count_session_id) ?? 0) + 1);
      }
    }
  }

  const varianceBySession = new Map<string, { counted: number; varianceCount: number; varianceValue: number }>();
  if (finishedSessionIds.length > 0) {
    const { data: finishedLines, error } = await admin
      .from("count_lines")
      .select("count_session_id, physical_qty, expected_qty, ledger_qty, products(unit_cost)")
      .in("count_session_id", finishedSessionIds);
    if (error) throw new Error(error.message);
    for (const l of finishedLines ?? []) {
      const entry = varianceBySession.get(l.count_session_id) ?? { counted: 0, varianceCount: 0, varianceValue: 0 };
      entry.counted += 1;
      const variance = (l.physical_qty ?? 0) - l.expected_qty;
      const bookDiffers = l.ledger_qty != null && l.ledger_qty !== l.expected_qty;
      if (variance !== 0 || bookDiffers) entry.varianceCount += 1;
      entry.varianceValue += variance * (l.products?.unit_cost ?? 0);
      varianceBySession.set(l.count_session_id, entry);
    }
  }

  const departmentRows: DepartmentCountRow[] = activeDepartments.map((d) => {
    const session = sessionByDept.get(d.id);
    const productCount = productCountByDept.get(d.id) ?? 0;
    if (!session) {
      return { departmentId: d.id, departmentName: d.name, productCount, status: "NOT_STARTED", sessionId: null, countedCount: null, varianceCount: null, varianceValue: null };
    }
    if (session.status === "DRAFT") {
      return {
        departmentId: d.id,
        departmentName: d.name,
        productCount,
        status: "DRAFT",
        sessionId: session.id,
        countedCount: countedByDraftSession.get(session.id) ?? 0,
        varianceCount: null,
        varianceValue: null,
      };
    }
    const agg = varianceBySession.get(session.id) ?? { counted: 0, varianceCount: 0, varianceValue: 0 };
    return {
      departmentId: d.id,
      departmentName: d.name,
      productCount,
      status: session.status,
      sessionId: session.id,
      countedCount: agg.counted,
      varianceCount: agg.varianceCount,
      varianceValue: agg.varianceValue,
    };
  });

  const countedDepartments = departmentRows.filter((r) => r.status === "COMPLETED" || r.status === "LOCKED").length;
  const varianceLineCount = departmentRows.reduce((sum, r) => sum + (r.varianceCount ?? 0), 0);
  const varianceValue = departmentRows.reduce((sum, r) => sum + (r.varianceValue ?? 0), 0);

  let awaitingQuery = admin.from("count_sessions").select("id", { count: "exact", head: true }).eq("status", "COMPLETED");
  if (departmentId) awaitingQuery = awaitingQuery.eq("department_id", departmentId);
  const { count: awaitingReconciliation, error: awaitingError } = await awaitingQuery;
  if (awaitingError) throw new Error(awaitingError.message);

  // Stock ledger: get_department_balance is the one function every balance
  // figure in this app goes through (CLAUDE.md) — summed per department for
  // the same business day the rest of the dashboard uses.
  const ledgerRows: LedgerRow[] = await Promise.all(
    activeDepartments.map(async (d) => {
      const { data: balance, error } = await admin.rpc("get_department_balance", { p_department_id: d.id, p_as_at_date: businessDay });
      if (error) throw new Error(error.message);
      const rows = balance ?? [];
      return {
        departmentId: d.id,
        departmentName: d.name,
        openingValue: rows.reduce((s, r) => s + r.opening_value, 0),
        receivedValue: rows.reduce((s, r) => s + r.received_value, 0),
        issuedValue: rows.reduce((s, r) => s + r.issued_value, 0),
        closingValue: rows.reduce((s, r) => s + r.closing_value, 0),
        productCount: rows.length,
      };
    })
  );

  const ledgerTotals = ledgerRows.reduce(
    (acc, r) => ({
      openingValue: acc.openingValue + r.openingValue,
      receivedValue: acc.receivedValue + r.receivedValue,
      issuedValue: acc.issuedValue + r.issuedValue,
      closingValue: acc.closingValue + r.closingValue,
      productCount: acc.productCount + r.productCount,
    }),
    { openingValue: 0, receivedValue: 0, issuedValue: 0, closingValue: 0, productCount: 0 }
  );

  const repeatVariances = await getRepeatVariances(admin, departmentId);
  const recentMovements = await getRecentMovements(admin, departmentId);

  return {
    businessDay,
    departmentRows,
    ledgerRows,
    ledgerTotals,
    stats: {
      countedDepartments,
      activeDepartments: activeDepartments.length,
      varianceLineCount,
      varianceValue,
      awaitingReconciliation: awaitingReconciliation ?? 0,
    },
    repeatVariances,
    recentMovements,
  };
}

// Repeat variances: any product/department pair that has tallied wrong more
// than once across the last 30 days of finished sessions — a single one-off
// miss isn't a "repeat", so occurrences < 2 are dropped. totalValue sums the
// unsigned magnitude per occurrence (total exposure), while totalVariance
// stays signed (net short/excess) for the coloured "Total" column.
async function getRepeatVariances(admin: AdminClient, departmentId?: string): Promise<RepeatVarianceRow[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().slice(0, 10);

  let sessionQuery = admin
    .from("count_sessions")
    .select("id, department_id, departments(name)")
    .in("status", ["COMPLETED", "LOCKED"])
    .gte("as_at_date", thirtyDaysAgoIso);
  if (departmentId) sessionQuery = sessionQuery.eq("department_id", departmentId);
  const { data: recentSessions, error: recentSessionsError } = await sessionQuery;
  if (recentSessionsError) throw new Error(recentSessionsError.message);
  if (!recentSessions || recentSessions.length === 0) return [];

  const sessionIds = recentSessions.map((s) => s.id);
  const deptBySession = new Map(recentSessions.map((s) => [s.id, { id: s.department_id, name: s.departments?.name ?? "—" }]));

  const { data: lines, error } = await admin
    .from("count_lines")
    .select("count_session_id, product_id, physical_qty, expected_qty, products(code, name, unit_cost)")
    .in("count_session_id", sessionIds);
  if (error) throw new Error(error.message);

  const agg = new Map<string, RepeatVarianceRow>();
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

  return Array.from(agg.values())
    .filter((r) => r.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);
}

async function getRecentMovements(admin: AdminClient, departmentId?: string): Promise<RecentMovementRow[]> {
  let query = admin
    .from("movements_detail")
    .select(
      "id, type, created_at, quantity, product_name, from_department_id, to_department_id, from_department_name, to_department_name, supplier_name, created_by_name"
    );
  if (departmentId) query = query.or(`from_department_id.eq.${departmentId},to_department_id.eq.${departmentId}`);
  const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(8);
  if (error) throw new Error(error.message);

  return (rows ?? []).map((m) => ({
    id: m.id!,
    type: m.type!,
    createdAt: m.created_at!,
    createdByName: m.created_by_name!,
    detail:
      m.type === "PURCHASE"
        ? `${m.supplier_name ?? "Supplier"} → ${m.to_department_name} · ${m.quantity} ${m.product_name}`
        : m.type === "OPENING"
          ? `${m.to_department_name} · ${m.quantity} ${m.product_name}`
          : m.type === "REQUISITION"
            ? `${m.from_department_name} → ${m.to_department_name} · ${m.quantity} ${m.product_name}`
            : `${m.from_department_name} · ${m.quantity} ${m.product_name}`,
  }));
}
