"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole, type CurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;

const POSTING_ROLES = ["ADMIN", "STOREKEEPER"] as const;

function canPostForAnyDepartment(role: CurrentProfile["role"]) {
  return (POSTING_ROLES as readonly string[]).includes(role);
}

// A DEPARTMENT_USER may only ever act on their own department; ADMIN/
// STOREKEEPER may act on any (non-central) department they pass in.
function resolveDepartmentAccess(profile: CurrentProfile, departmentId: string) {
  if (profile.role === "DEPARTMENT_USER") {
    if (profile.departmentId !== departmentId) {
      throw new Error("You can only record sales for your own department.");
    }
    return;
  }
  if (!canPostForAnyDepartment(profile.role)) {
    throw new Error("You don't have permission to record sales.");
  }
}

async function assertNotCentralStore(admin: AdminClient, departmentId: string) {
  const { data, error } = await admin.from("departments").select("id, name, is_central_store").eq("id", departmentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Department not found.");
  if (data.is_central_store) {
    throw new Error("The central store has no sales — it issues requisitions instead.");
  }
  return data;
}

// ============================================================================
// DEPARTMENTS FOR THE DEPARTMENT SELECTOR (ADMIN/STOREKEEPER only — a
// DEPARTMENT_USER's department is fixed and never comes from this list)
// ============================================================================

export async function listSalesDepartments() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("departments")
    .select("id, name")
    .eq("is_active", true)
    .eq("is_central_store", false)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ============================================================================
// PRODUCT SEARCH — restricted to products assigned to the selected
// department (same reasoning as Requisitions' search, see lib/movements/actions.ts),
// annotated with opening/received for the business day and whether a live
// (non-reversed) SALE already exists for this product/day, so the batch form
// can offer skip-or-correct before the line is even added.
// ============================================================================

export type SalesProductResult = {
  id: string;
  code: string;
  name: string;
  assignedToDepartment: boolean;
  openingQty: number;
  receivedQty: number;
  existingSale: { movementId: string; quantity: number } | null;
};

export async function searchProductsForSale(
  query: string,
  departmentId: string,
  businessDay: string
): Promise<SalesProductResult[]> {
  const profile = await getCurrentProfile();
  resolveDepartmentAccess(profile, departmentId);

  const admin = createAdminClient();
  await assertNotCentralStore(admin, departmentId);

  const trimmed = query.trim();
  let productsQuery = admin.from("products").select("id, code, name").eq("is_active", true).order("name").limit(20);
  if (trimmed) productsQuery = productsQuery.or(`code.ilike.%${trimmed}%,name.ilike.%${trimmed}%`);
  const { data: products, error } = await productsQuery;
  if (error) throw new Error(error.message);
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);

  const { data: assignments, error: assignError } = await admin
    .from("product_assignments")
    .select("product_id")
    .eq("department_id", departmentId)
    .in("product_id", productIds);
  if (assignError) throw new Error(assignError.message);
  const assignedIds = new Set((assignments ?? []).map((a) => a.product_id));

  const { data: balances, error: balanceError } = await admin.rpc("get_department_balance", {
    p_department_id: departmentId,
    p_as_at_date: businessDay,
  });
  if (balanceError) throw new Error(balanceError.message);
  const balanceByProduct = new Map((balances ?? []).map((b) => [b.product_id, b]));

  const existingSaleByProduct = await findLiveSalesForProducts(admin, departmentId, businessDay, productIds);

  return products.map((p) => {
    const balance = balanceByProduct.get(p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      assignedToDepartment: assignedIds.has(p.id),
      openingQty: balance?.opening_qty ?? 0,
      receivedQty: balance?.received_qty ?? 0,
      existingSale: existingSaleByProduct.get(p.id) ?? null,
    };
  });
}

// A "live" sale is an original (non-reversal) SALE row for this department/
// business day that hasn't itself been reversed yet — see the migration
// header on post_sales_batch for why this is the correct definition (a
// correction always fully replaces: reverse the old row, insert a fresh one).
async function findLiveSalesForProducts(admin: AdminClient, departmentId: string, businessDay: string, productIds: string[]) {
  const { data, error } = await admin
    .from("movements")
    .select("id, product_id, quantity, reversal_of_movement_id")
    .eq("type", "SALE")
    .eq("from_department_id", departmentId)
    .eq("business_day", businessDay)
    .in("product_id", productIds);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const reversedIds = new Set(rows.filter((r) => r.reversal_of_movement_id).map((r) => r.reversal_of_movement_id as string));

  const result = new Map<string, { movementId: string; quantity: number }>();
  for (const row of rows) {
    if (row.reversal_of_movement_id) continue; // this row IS a reversal, not a live original
    if (reversedIds.has(row.id)) continue; // this original has since been reversed
    result.set(row.product_id, { movementId: row.id, quantity: row.quantity });
  }
  return result;
}

// ============================================================================
// SALES CONTEXT — the full set of active products assigned to a department
// for a business day (opening/received included), used to compute the
// zero-sales summary ("N products in the batch, the other M will be posted as
// zero"). Single get_department_balance call — same source every other
// balance figure in the app goes through.
// ============================================================================

export type SalesContextProduct = { id: string; code: string; name: string; openingQty: number; receivedQty: number };

export async function getSalesContext(
  departmentId: string,
  businessDay: string
): Promise<{ departmentName: string; products: SalesContextProduct[] }> {
  const profile = await getCurrentProfile();
  resolveDepartmentAccess(profile, departmentId);

  const admin = createAdminClient();
  const department = await assertNotCentralStore(admin, departmentId);

  const { data, error } = await admin.rpc("get_department_balance", {
    p_department_id: departmentId,
    p_as_at_date: businessDay,
  });
  if (error) throw new Error(error.message);

  return {
    departmentName: department.name,
    products: (data ?? []).map((b) => ({
      id: b.product_id,
      code: b.product_code,
      name: b.product_name,
      openingQty: b.opening_qty,
      receivedQty: b.received_qty,
    })),
  };
}

// ============================================================================
// DRAFT BATCHES — persisted server-side as lines are added, tied to
// (created_by, department, business day). See SPEC.md's draft batch section.
// ============================================================================

export type SaleDraftLine = {
  productId: string;
  code: string;
  name: string;
  openingQty: number;
  receivedQty: number;
  quantity: number;
  isOverride: boolean;
  overrideReason: string;
  correctionOfMovementId: string | null;
  correctionReason: string;
};

export async function getSalesDraft(departmentId: string, businessDay: string): Promise<SaleDraftLine[] | null> {
  const profile = await getCurrentProfile();
  resolveDepartmentAccess(profile, departmentId);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sale_drafts")
    .select("lines")
    .eq("department_id", departmentId)
    .eq("business_day", businessDay)
    .eq("created_by", profile.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const lines = data.lines as unknown as SaleDraftLine[];
  return lines.length > 0 ? lines : null;
}

export async function saveSalesDraft(departmentId: string, businessDay: string, lines: SaleDraftLine[]) {
  const profile = await getCurrentProfile();
  resolveDepartmentAccess(profile, departmentId);

  const admin = createAdminClient();
  const { error } = await admin
    .from("sale_drafts")
    .upsert(
      { department_id: departmentId, business_day: businessDay, created_by: profile.id, lines: lines as unknown as Database["public"]["Tables"]["sale_drafts"]["Insert"]["lines"], updated_at: new Date().toISOString() },
      { onConflict: "department_id,business_day,created_by" }
    );
  if (error) throw new Error(error.message);
}

export async function clearSalesDraft(departmentId: string, businessDay: string) {
  const profile = await getCurrentProfile();
  resolveDepartmentAccess(profile, departmentId);

  const admin = createAdminClient();
  const { error } = await admin
    .from("sale_drafts")
    .delete()
    .eq("department_id", departmentId)
    .eq("business_day", businessDay)
    .eq("created_by", profile.id);
  if (error) throw new Error(error.message);
}

// ============================================================================
// POST BATCH
// ============================================================================

export type SalesLineInput = {
  productId: string;
  quantity: number;
  isOverride: boolean;
  overrideReason: string;
  correctionOfMovementId: string | null;
  correctionReason: string;
};

export async function postSalesBatch(input: { businessDay: string; departmentId: string; lines: SalesLineInput[] }) {
  const profile = await getCurrentProfile();
  resolveDepartmentAccess(profile, input.departmentId);

  if (input.lines.length === 0) throw new Error("Add at least one product to the batch.");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) {
      throw new Error("Every quantity must be zero or a positive whole number.");
    }
    if (line.isOverride && !line.overrideReason.trim()) {
      throw new Error("An override reason is required for every overridden line.");
    }
    if (line.correctionOfMovementId && !line.correctionReason.trim()) {
      throw new Error("A reason is required for every corrected line.");
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("post_sales_batch", {
    p_business_day: input.businessDay,
    p_department_id: input.departmentId,
    p_created_by: profile.id,
    p_lines: input.lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      is_override: l.isOverride,
      override_reason: l.isOverride ? l.overrideReason.trim() : "",
      correction_of_movement_id: l.correctionOfMovementId ?? "",
      correction_reason: l.correctionOfMovementId ? l.correctionReason.trim() : "",
    })),
  });
  if (error) throw new Error(error.message);

  await clearSalesDraft(input.departmentId, input.businessDay);

  revalidatePath("/sales");
  revalidatePath("/sales/history");
  revalidatePath("/movements");
  revalidatePath("/");
  return { count: data?.length ?? 0 };
}

// ============================================================================
// SALES HISTORY — a filtered read of movements_detail (type = SALE), scoped
// the same way Movements is: DEPARTMENT_USER sees only their own department
// (from_department_id, since a SALE only ever has a from side), ADMIN/AUDITOR/
// STOREKEEPER see every department. AUDITOR can reach this page but has no
// posting action available anywhere in this module.
// ============================================================================

const SALES_HISTORY_PAGE_SIZE = 50;

export type SalesHistoryFilters = {
  departmentId?: string;
  businessDayFrom?: string;
  businessDayTo?: string;
  q?: string;
};

export type SalesHistoryRow = {
  id: string;
  businessDay: string;
  createdAt: string;
  departmentName: string;
  productCode: string;
  productName: string;
  quantity: number;
  createdByName: string;
  isOverride: boolean;
  isReversal: boolean;
  isReversed: boolean;
};

type MovementsDetailRow = Database["public"]["Views"]["movements_detail"]["Row"];

function toSalesHistoryRow(m: MovementsDetailRow): SalesHistoryRow {
  return {
    id: m.id!,
    businessDay: m.business_day!,
    createdAt: m.created_at!,
    departmentName: m.from_department_name ?? "—",
    productCode: m.product_code!,
    productName: m.product_name!,
    quantity: m.quantity!,
    createdByName: m.created_by_name!,
    isOverride: m.is_override ?? false,
    isReversal: m.reversal_of_movement_id != null,
    isReversed: m.reversed_by_movement_id != null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySalesHistoryScope(query: any, profile: CurrentProfile, filters: SalesHistoryFilters): any {
  let q = query.eq("type", "SALE");
  if (profile.role === "DEPARTMENT_USER") {
    if (!profile.departmentId) return null;
    q = q.eq("from_department_id", profile.departmentId);
  }
  if (filters.departmentId) q = q.eq("from_department_id", filters.departmentId);
  if (filters.businessDayFrom) q = q.gte("business_day", filters.businessDayFrom);
  if (filters.businessDayTo) q = q.lte("business_day", filters.businessDayTo);
  if (filters.q?.trim()) {
    const trimmed = filters.q.trim();
    q = q.or(`product_code.ilike.%${trimmed}%,product_name.ilike.%${trimmed}%`);
  }
  return q;
}

export async function listSalesHistory(
  filters: SalesHistoryFilters,
  page: number
): Promise<{ rows: SalesHistoryRow[]; totalCount: number; page: number; totalPages: number }> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const base = admin.from("movements_detail").select("*", { count: "exact" });
  const scoped = applySalesHistoryScope(base, profile, filters);
  if (!scoped) return { rows: [], totalCount: 0, page: 1, totalPages: 1 };

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * SALES_HISTORY_PAGE_SIZE;
  const { data, count, error } = await scoped
    .order("created_at", { ascending: false })
    .range(from, from + SALES_HISTORY_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / SALES_HISTORY_PAGE_SIZE));

  return { rows: (data ?? []).map(toSalesHistoryRow), totalCount, page: safePage, totalPages };
}

const EXPORT_ROW_CAP = 20000;

export async function listSalesHistoryForExport(filters: SalesHistoryFilters): Promise<SalesHistoryRow[]> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const base = admin.from("movements_detail").select("*");
  const scoped = applySalesHistoryScope(base, profile, filters);
  if (!scoped) return [];

  const { data, error } = await scoped.order("created_at", { ascending: false }).limit(EXPORT_ROW_CAP);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSalesHistoryRow);
}
