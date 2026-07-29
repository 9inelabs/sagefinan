"use server";

import { getCurrentProfile, type CurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type MovementsDetailRow = Database["public"]["Views"]["movements_detail"]["Row"];

// ============================================================================
// REQUISITION HISTORY + RECEIPTS — mirrors lib/sales/actions.ts's grouped
// history exactly (see its own comment for the full reasoning: one group per
// business day + department + who posted the batch, grouped in application
// code, groups paginated rather than raw rows). The one real difference:
// requisitions always originate at the central store, so grouping by
// to_department_id (the destination) is what's meaningful — from_department_id
// is the same central store on every row and would tell you nothing.
//
// Scoping mirrors lib/movements/actions.ts's applyMovementScope: STOREKEEPER
// sees everything touching their own department, which — since they're
// always at the central store and every requisition's from_department_id is
// the central store — naturally means every requisition, with no special
// case needed. DEPARTMENT_USER sees only requisitions where their own
// department is the destination, which is exactly what makes this page
// double as a non-stocking department's own "what did we receive" record.
// ============================================================================

const HISTORY_GROUP_PAGE_SIZE = 30;
const EXPORT_ROW_CAP = 20000;

export type RequisitionHistoryFilters = {
  departmentId?: string;
  businessDayFrom?: string;
  businessDayTo?: string;
  q?: string;
};

export type RequisitionHistoryGroup = {
  businessDay: string;
  departmentId: string;
  departmentName: string;
  createdBy: string;
  createdByName: string;
  lineCount: number;
  totalQuantity: number;
  hasOverride: boolean;
  hasReversal: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRequisitionHistoryScope(query: any, profile: CurrentProfile, filters: RequisitionHistoryFilters): any {
  let q = query.eq("type", "REQUISITION");
  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    if (!profile.departmentId) return null;
    q = q.or(`from_department_id.eq.${profile.departmentId},to_department_id.eq.${profile.departmentId}`);
  }
  if (filters.departmentId) q = q.eq("to_department_id", filters.departmentId);
  if (filters.businessDayFrom) q = q.gte("business_day", filters.businessDayFrom);
  if (filters.businessDayTo) q = q.lte("business_day", filters.businessDayTo);
  if (filters.q?.trim()) {
    const trimmed = filters.q.trim();
    q = q.or(`product_code.ilike.%${trimmed}%,product_name.ilike.%${trimmed}%`);
  }
  return q;
}

function groupRequisitionRows(rows: MovementsDetailRow[]): RequisitionHistoryGroup[] {
  const map = new Map<string, RequisitionHistoryGroup>();
  for (const m of rows) {
    const key = `${m.business_day}:${m.to_department_id}:${m.created_by}`;
    const existing = map.get(key);
    const isOverride = m.is_override ?? false;
    const isFlagged = m.reversal_of_movement_id != null || m.reversed_by_movement_id != null;
    if (existing) {
      existing.lineCount += 1;
      existing.totalQuantity += m.quantity!;
      existing.hasOverride = existing.hasOverride || isOverride;
      existing.hasReversal = existing.hasReversal || isFlagged;
    } else {
      map.set(key, {
        businessDay: m.business_day!,
        departmentId: m.to_department_id!,
        departmentName: m.to_department_name ?? "—",
        createdBy: m.created_by!,
        createdByName: m.created_by_name!,
        lineCount: 1,
        totalQuantity: m.quantity!,
        hasOverride: isOverride,
        hasReversal: isFlagged,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.businessDay !== b.businessDay) return b.businessDay.localeCompare(a.businessDay);
    return a.departmentName.localeCompare(b.departmentName);
  });
}

export async function listRequisitionHistoryGroups(
  filters: RequisitionHistoryFilters,
  page: number
): Promise<{ groups: RequisitionHistoryGroup[]; totalCount: number; page: number; totalPages: number }> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const base = admin.from("movements_detail").select("*");
  const scoped = applyRequisitionHistoryScope(base, profile, filters);
  if (!scoped) return { groups: [], totalCount: 0, page: 1, totalPages: 1 };

  const { data, error } = await scoped.order("business_day", { ascending: false }).limit(EXPORT_ROW_CAP);
  if (error) throw new Error(error.message);

  const groups = groupRequisitionRows(data ?? []);
  const totalCount = groups.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / HISTORY_GROUP_PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const from = (safePage - 1) * HISTORY_GROUP_PAGE_SIZE;

  return { groups: groups.slice(from, from + HISTORY_GROUP_PAGE_SIZE), totalCount, page: safePage, totalPages };
}

export type RequisitionReceiptLine = {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  isOverride: boolean;
  isReversal: boolean;
  isReversed: boolean;
};

export type RequisitionReceiptDetail = {
  businessDay: string;
  departmentName: string;
  createdByName: string;
  lines: RequisitionReceiptLine[];
};

export async function getRequisitionReceiptDetail(
  departmentId: string,
  businessDay: string,
  createdBy: string
): Promise<RequisitionReceiptDetail | null> {
  const profile = await getCurrentProfile();
  if ((profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") && profile.departmentId !== departmentId) {
    throw new Error("You don't have access to that department's requisition history.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("movements_detail")
    .select("*")
    .eq("type", "REQUISITION")
    .eq("to_department_id", departmentId)
    .eq("business_day", businessDay)
    .eq("created_by", createdBy)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  return {
    businessDay,
    departmentName: data[0].to_department_name ?? "—",
    createdByName: data[0].created_by_name!,
    lines: data.map((m) => ({
      id: m.id!,
      productCode: m.product_code!,
      productName: m.product_name!,
      quantity: m.quantity!,
      isOverride: m.is_override ?? false,
      isReversal: m.reversal_of_movement_id != null,
      isReversed: m.reversed_by_movement_id != null,
    })),
  };
}
