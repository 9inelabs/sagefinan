"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
export type MovementType = Database["public"]["Enums"]["movement_type"];

async function getCentralStoreDepartment(admin: AdminClient) {
  const { data, error } = await admin.from("departments").select("id, name").eq("is_central_store", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No department is flagged as the central store.");
  return data;
}

// ============================================================================
// PRODUCT SEARCH (live, as-you-type combobox on the Purchases/Requisitions
// batch forms)
// ============================================================================

export type PurchaseProductResult = {
  id: string;
  code: string;
  name: string;
  assignedToCentral: boolean;
  availableQty: number | null;
};

// Restricted to active products assigned to the central store — every
// balance figure on this screen goes through get_department_balance per
// CLAUDE.md's "never hand-roll a movement sum" rule, and that function only
// returns rows for assigned products, so an unassigned product has no
// context to show here.
// Performance note: this used to (a) fetch the central store department,
// then (b) search products, then (c) call get_department_balance for the
// WHOLE department — three sequential round trips, the last one recomputing
// a balance for every assigned product even though only ~20 results are
// ever shown. (a) and (b) don't depend on each other, so they now run in
// parallel; (c) now passes the matched product ids so the balance function
// only computes (and returns) rows for products actually on screen. See
// CLAUDE.md's "Search performance" note for the measurements behind this.
export async function searchProductsForPurchase(query: string, businessDay: string): Promise<PurchaseProductResult[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  const admin = createAdminClient();

  const trimmed = query.trim();
  let productsQuery = admin.from("products").select("id, code, name").eq("is_active", true).order("name").limit(20);
  if (trimmed) productsQuery = productsQuery.or(`code.ilike.%${trimmed}%,name.ilike.%${trimmed}%`);

  const [central, { data: products, error }] = await Promise.all([getCentralStoreDepartment(admin), productsQuery]);
  if (error) throw new Error(error.message);
  if (!products || products.length === 0) return [];

  const { data: balances, error: balanceError } = await admin.rpc("get_department_balance", {
    p_department_id: central.id,
    p_as_at_date: businessDay,
    p_product_ids: products.map((p) => p.id),
  });
  if (balanceError) throw new Error(balanceError.message);
  const balanceByProduct = new Map((balances ?? []).map((b) => [b.product_id, b.closing_qty]));

  return products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    assignedToCentral: balanceByProduct.has(p.id),
    availableQty: balanceByProduct.get(p.id) ?? null,
  }));
}

export type RequisitionProductResult = {
  id: string;
  code: string;
  name: string;
  assignedToDestination: boolean;
  availableQty: number | null;
};

// Restricted to active products assigned to the destination department — you
// can't sensibly requisition something the department doesn't stock. Results
// still surface unassigned matches (flagged, not hidden) so the UI can say so
// plainly and link to the assignment screen, per SPEC.md.
//
// Performance note: central-store lookup and the product search are
// independent, so they run in parallel; the assignment check and the
// balance figure are both independent of each other once the matched
// product ids are known, so they also run in parallel — four sequential
// round trips down to two. The balance call is scoped to just the matched
// products instead of recomputing the whole central store on every
// keystroke — see CLAUDE.md's "Search performance" note.
export async function searchProductsForRequisition(
  query: string,
  toDepartmentId: string,
  businessDay: string
): Promise<RequisitionProductResult[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  const admin = createAdminClient();

  const trimmed = query.trim();
  let productsQuery = admin.from("products").select("id, code, name").eq("is_active", true).order("name").limit(20);
  if (trimmed) productsQuery = productsQuery.or(`code.ilike.%${trimmed}%,name.ilike.%${trimmed}%`);

  const [central, { data: products, error }] = await Promise.all([getCentralStoreDepartment(admin), productsQuery]);
  if (toDepartmentId === central.id) throw new Error("Requisitions cannot target the central store.");
  if (error) throw new Error(error.message);
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const [{ data: assignments, error: assignError }, { data: balances, error: balanceError }] = await Promise.all([
    admin.from("product_assignments").select("product_id").eq("department_id", toDepartmentId).in("product_id", productIds),
    admin.rpc("get_department_balance", { p_department_id: central.id, p_as_at_date: businessDay, p_product_ids: productIds }),
  ]);
  if (assignError) throw new Error(assignError.message);
  if (balanceError) throw new Error(balanceError.message);
  const assignedIds = new Set((assignments ?? []).map((a) => a.product_id));
  const balanceByProduct = new Map((balances ?? []).map((b) => [b.product_id, b.closing_qty]));

  return products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    assignedToDestination: assignedIds.has(p.id),
    availableQty: balanceByProduct.get(p.id) ?? null,
  }));
}

export async function listRequisitionDestinations() {
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

// Only DEPARTMENT_USER profiles can be assigned to a non-central department
// (validate_profile_department enforces STOREKEEPER = central store only,
// ADMIN/AUDITOR have no department) — so this is exactly "who at that
// department could plausibly receive a delivery."
export async function listReceivers(departmentId: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ============================================================================
// BATCH POSTING
// ============================================================================

export type PurchaseLineInput = { productId: string; quantity: number };

export async function postPurchaseBatch(input: {
  businessDay: string;
  supplierName: string;
  invoiceReference: string;
  lines: PurchaseLineInput[];
}) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  const supplierName = input.supplierName.trim();
  if (!supplierName) throw new Error("Supplier name is required.");
  if (input.lines.length === 0) throw new Error("Add at least one product to the batch.");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Every quantity must be a positive whole number.");
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("post_purchase_batch", {
    p_business_day: input.businessDay,
    p_supplier_name: supplierName,
    p_invoice_reference: input.invoiceReference.trim() || "",
    p_created_by: profile.id,
    p_lines: input.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/purchases");
  revalidatePath("/movements");
  revalidatePath("/");
  return { count: data?.length ?? 0 };
}

export type RequisitionLineInput = {
  productId: string;
  quantity: number;
  isOverride: boolean;
  overrideReason: string;
};

export async function postRequisitionBatch(input: {
  businessDay: string;
  toDepartmentId: string;
  receivedBy: string;
  lines: RequisitionLineInput[];
}) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  if (!input.toDepartmentId) throw new Error("Destination department is required.");
  if (!input.receivedBy) throw new Error("Received by is required.");
  if (input.lines.length === 0) throw new Error("Add at least one product to the batch.");
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error("Every quantity must be a positive whole number.");
    }
    if (line.isOverride && !line.overrideReason.trim()) {
      throw new Error("An override reason is required for every overridden line.");
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("post_requisition_batch", {
    p_business_day: input.businessDay,
    p_to_department_id: input.toDepartmentId,
    p_received_by: input.receivedBy,
    p_created_by: profile.id,
    p_lines: input.lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      is_override: l.isOverride,
      override_reason: l.isOverride ? l.overrideReason.trim() : "",
    })),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/requisitions");
  revalidatePath("/movements");
  revalidatePath("/");
  return { count: data?.length ?? 0 };
}

export async function reverseMovement(movementId: string, reason: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to reverse a movement.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("post_movement_reversal", {
    p_movement_id: movementId,
    p_reason: trimmed,
    p_created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/movements");
  revalidatePath(`/movements/${movementId}`);
  revalidatePath("/");
  return { id: data as string };
}

// ============================================================================
// MOVEMENTS LIST / DETAIL — every role in lib/nav.ts's "movements" entry can
// read this; STOREKEEPER/DEPARTMENT_USER are scoped to movements touching
// their own department (mirrors the movements_select RLS policy from
// 20260721121600_initial_schema.sql, applied here since reads go through the
// service-role admin client, not RLS).
// ============================================================================

const MOVEMENTS_PAGE_SIZE = 50;

export type MovementFilters = {
  type?: MovementType;
  departmentId?: string;
  businessDayFrom?: string;
  businessDayTo?: string;
  q?: string;
  overrideOnly?: boolean;
};

export type MovementRow = {
  id: string;
  businessDay: string;
  createdAt: string;
  type: MovementType;
  productCode: string;
  productName: string;
  fromDepartmentName: string | null;
  toDepartmentName: string | null;
  quantity: number;
  createdByName: string;
  receivedByName: string | null;
  isOverride: boolean;
  isReversal: boolean;
  isReversed: boolean;
};

type MovementsDetailRow = Database["public"]["Views"]["movements_detail"]["Row"];

function toMovementRow(m: MovementsDetailRow): MovementRow {
  return {
    id: m.id!,
    businessDay: m.business_day!,
    createdAt: m.created_at!,
    type: m.type!,
    productCode: m.product_code!,
    productName: m.product_name!,
    fromDepartmentName: m.from_department_name,
    toDepartmentName: m.to_department_name,
    quantity: m.quantity!,
    createdByName: m.created_by_name!,
    receivedByName: m.received_by_name,
    isOverride: m.is_override ?? false,
    isReversal: m.reversal_of_movement_id != null,
    isReversed: m.reversed_by_movement_id != null,
  };
}

type CurrentProfile = Awaited<ReturnType<typeof getCurrentProfile>>;

// Supabase-js's PostgrestFilterBuilder type doesn't factor cleanly through a
// shared helper across two different starting queries (paginated list vs.
// uncapped export), so this deliberately types loosely and lets each call
// site's own query construction carry the real type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMovementScope(query: any, profile: CurrentProfile, filters: MovementFilters): any {
  let q = query;
  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    if (!profile.departmentId) return null;
    q = q.or(`from_department_id.eq.${profile.departmentId},to_department_id.eq.${profile.departmentId}`);
  }
  if (filters.type) q = q.eq("type", filters.type);
  if (filters.departmentId) {
    q = q.or(`from_department_id.eq.${filters.departmentId},to_department_id.eq.${filters.departmentId}`);
  }
  if (filters.businessDayFrom) q = q.gte("business_day", filters.businessDayFrom);
  if (filters.businessDayTo) q = q.lte("business_day", filters.businessDayTo);
  if (filters.q?.trim()) {
    const trimmed = filters.q.trim();
    q = q.or(`product_code.ilike.%${trimmed}%,product_name.ilike.%${trimmed}%`);
  }
  if (filters.overrideOnly) q = q.eq("is_override", true);
  return q;
}

export async function listMovements(
  filters: MovementFilters,
  page: number
): Promise<{ rows: MovementRow[]; totalCount: number; page: number; totalPages: number }> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const base = admin.from("movements_detail").select("*", { count: "exact" });
  const scoped = applyMovementScope(base, profile, filters);
  if (!scoped) return { rows: [], totalCount: 0, page: 1, totalPages: 1 };

  const safePage = Math.max(1, page);
  const from = (safePage - 1) * MOVEMENTS_PAGE_SIZE;
  const { data, count, error } = await scoped
    .order("created_at", { ascending: false })
    .range(from, from + MOVEMENTS_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / MOVEMENTS_PAGE_SIZE));

  return { rows: (data ?? []).map(toMovementRow), totalCount, page: safePage, totalPages };
}

const EXPORT_ROW_CAP = 20000;

export async function listMovementsForExport(filters: MovementFilters): Promise<MovementRow[]> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const base = admin.from("movements_detail").select("*");
  const scoped = applyMovementScope(base, profile, filters);
  if (!scoped) return [];

  const { data, error } = await scoped.order("created_at", { ascending: false }).limit(EXPORT_ROW_CAP);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toMovementRow);
}

export type MovementDetail = MovementRow & {
  note: string | null;
  supplierName: string | null;
  invoiceReference: string | null;
  overrideReason: string | null;
  productId: string;
  fromDepartmentId: string | null;
  toDepartmentId: string | null;
  reversalOfMovementId: string | null;
  reversedByMovementId: string | null;
};

export async function getMovementDetail(id: string): Promise<MovementDetail | null> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  const { data, error } = await admin.from("movements_detail").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    const touches = data.from_department_id === profile.departmentId || data.to_department_id === profile.departmentId;
    if (!touches) return null;
  }

  return {
    ...toMovementRow(data),
    note: data.note,
    supplierName: data.supplier_name,
    invoiceReference: data.invoice_reference,
    overrideReason: data.override_reason,
    productId: data.product_id!,
    fromDepartmentId: data.from_department_id,
    toDepartmentId: data.to_department_id,
    reversalOfMovementId: data.reversal_of_movement_id,
    reversedByMovementId: data.reversed_by_movement_id,
  };
}

export async function getOverrideCount(): Promise<number> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  const { count, error } = await admin.from("movements").select("id", { count: "exact", head: true }).eq("is_override", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
