"use server";

import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type MovementType = Database["public"]["Enums"]["movement_type"];

// ============================================================================
// DEPARTMENT PICKER — every role in lib/nav.ts's "Stock ledger" entry can
// reach this screen (ADMIN/AUDITOR/STOREKEEPER/DEPARTMENT_USER), but a scoped
// role only ever sees their own department: no picker to misuse, matching
// the existing /movements scoping (CLAUDE.md's "Movements" nav note).
// ============================================================================

export type LedgerDepartment = { id: string; name: string; isCentralStore: boolean };

export async function listLedgerDepartments(): Promise<LedgerDepartment[]> {
  const profile = await getCurrentProfile();
  const admin = createAdminClient();

  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    if (!profile.departmentId) return [];
    const { data, error } = await admin
      .from("departments")
      .select("id, name, is_central_store")
      .eq("id", profile.departmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? [{ id: data.id, name: data.name, isCentralStore: data.is_central_store }] : [];
  }

  const { data, error } = await admin.from("departments").select("id, name, is_central_store").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, isCentralStore: d.is_central_store }));
}

function assertDepartmentAccess(profile: Awaited<ReturnType<typeof getCurrentProfile>>, departmentId: string) {
  if ((profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") && profile.departmentId !== departmentId) {
    throw new Error("You don't have access to that department's ledger.");
  }
}

// ============================================================================
// LEDGER TABLE — thin wrapper over get_department_balance (CLAUDE.md: "never
// hand-roll a movement sum"). Dataset is bounded (a department stocks
// 50-150 products, SPEC.md's own scale target), so search/hasMovementOnly
// filtering happens in application code after one balance call rather than
// adding query complexity for a table this small.
// ============================================================================

export type LedgerRow = {
  productId: string;
  code: string;
  name: string;
  unitCost: number;
  openingQty: number;
  receivedQty: number;
  issuedQty: number;
  closingQty: number;
  closingValue: number;
  hasMovement: boolean;
};

export type LedgerData = {
  department: LedgerDepartment;
  asAtDate: string;
  rows: LedgerRow[];
  totalClosingValue: number;
  totalCount: number;
  shownCount: number;
};

export async function getLedgerData(input: {
  departmentId: string;
  asAtDate: string;
  search?: string;
  hasMovementOnly?: boolean;
}): Promise<LedgerData> {
  const profile = await getCurrentProfile();
  assertDepartmentAccess(profile, input.departmentId);

  const admin = createAdminClient();
  const { data: dept, error: deptError } = await admin
    .from("departments")
    .select("id, name, is_central_store")
    .eq("id", input.departmentId)
    .single();
  if (deptError || !dept) throw new Error(deptError?.message ?? "Department not found.");

  const { data: balances, error } = await admin.rpc("get_department_balance", {
    p_department_id: input.departmentId,
    p_as_at_date: input.asAtDate,
  });
  if (error) throw new Error(error.message);

  let rows: LedgerRow[] = (balances ?? []).map((b) => ({
    productId: b.product_id,
    code: b.product_code,
    name: b.product_name,
    unitCost: b.unit_cost,
    openingQty: b.opening_qty,
    receivedQty: b.received_qty,
    issuedQty: b.issued_qty,
    closingQty: b.closing_qty,
    closingValue: b.closing_value,
    hasMovement: b.received_qty !== 0 || b.issued_qty !== 0,
  }));

  const totalCount = rows.length;

  const trimmedSearch = input.search?.trim().toLowerCase();
  if (trimmedSearch) {
    rows = rows.filter((r) => r.code.toLowerCase().includes(trimmedSearch) || r.name.toLowerCase().includes(trimmedSearch));
  }
  if (input.hasMovementOnly) {
    rows = rows.filter((r) => r.hasMovement);
  }

  return {
    department: { id: dept.id, name: dept.name, isCentralStore: dept.is_central_store },
    asAtDate: input.asAtDate,
    rows,
    totalClosingValue: rows.reduce((sum, r) => sum + r.closingValue, 0),
    totalCount,
    shownCount: rows.length,
  };
}

// ============================================================================
// "SHOW ME WHY" — every movement behind one product's figures, up to and
// including the as-at date. This is exactly the set get_department_balance
// itself sums (to/from = this department, business_day <= as-at date) for
// this one product, so the two views can never disagree.
//
// SPEC.md's phase 7 brief also lists "adjustment" among what produced the
// closing number — but adjustments (count corrections, phase 5/6) only ever
// touch count_lines/adjustments, never movements, so they play no part in
// this figure (SPEC.md's own core accounting rule: closing is a pure
// movements sum). Deliberately not included here; see CLAUDE.md.
// ============================================================================

export type LedgerMovementRow = {
  id: string;
  businessDay: string;
  createdAt: string;
  type: MovementType;
  quantity: number;
  direction: "in" | "out";
  counterpartyName: string | null;
  createdByName: string;
  isReversal: boolean;
  isReversed: boolean;
  note: string | null;
};

export async function getLedgerProductHistory(input: {
  departmentId: string;
  productId: string;
  asAtDate: string;
}): Promise<{ productCode: string; productName: string; rows: LedgerMovementRow[] }> {
  const profile = await getCurrentProfile();
  assertDepartmentAccess(profile, input.departmentId);

  const admin = createAdminClient();
  const { data: product, error: productError } = await admin.from("products").select("code, name").eq("id", input.productId).single();
  if (productError || !product) throw new Error(productError?.message ?? "Product not found.");

  const { data, error } = await admin
    .from("movements_detail")
    .select("*")
    .eq("product_id", input.productId)
    .or(`from_department_id.eq.${input.departmentId},to_department_id.eq.${input.departmentId}`)
    .lte("business_day", input.asAtDate)
    .order("business_day", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows: LedgerMovementRow[] = (data ?? []).map((m) => {
    const direction: "in" | "out" = m.to_department_id === input.departmentId ? "in" : "out";
    const counterpartyName = direction === "in" ? m.from_department_name ?? m.supplier_name : m.to_department_name;
    return {
      id: m.id!,
      businessDay: m.business_day!,
      createdAt: m.created_at!,
      type: m.type!,
      quantity: m.quantity!,
      direction,
      counterpartyName: counterpartyName ?? null,
      createdByName: m.created_by_name!,
      isReversal: m.reversal_of_movement_id != null,
      isReversed: m.reversed_by_movement_id != null,
      note: m.note,
    };
  });

  return { productCode: product.code, productName: product.name, rows };
}
