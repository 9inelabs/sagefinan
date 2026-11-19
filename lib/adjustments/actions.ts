"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADJUSTMENT_CATEGORIES } from "@/lib/movements/labels";

// Stock adjustments (admin only): add or remove stock from one department
// with a reason — expired, damaged, found stock, corrections. Each one is an
// ADJUSTMENT movement (see 20261118090100_purchase_orders_adjustments.sql),
// so the stock ledger, reports and audit trail all show it, it can be
// reversed like any movement, and business-day locking applies.

export type AdjustmentDepartment = { id: string; name: string; isCentralStore: boolean };

export async function listAdjustmentDepartments(): Promise<AdjustmentDepartment[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("departments")
    .select("id, name, is_central_store")
    .eq("is_active", true)
    .eq("stocks_products", true)
    .order("is_central_store", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, isCentralStore: d.is_central_store }));
}

export type AdjustmentProductResult = {
  id: string;
  code: string;
  name: string;
  closingQty: number;
  unitCost: number;
};

// Only products the department stocks — the balance it shows is the closing
// figure for the chosen business day, the same one post_stock_adjustment
// re-checks a removal against.
export async function searchProductsForAdjustment(departmentId: string, query: string, businessDay: string): Promise<AdjustmentProductResult[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);
  const admin = createAdminClient();

  const trimmed = query.trim();
  let productsQuery = admin.from("products").select("id").eq("is_active", true).order("name").limit(40);
  if (trimmed) productsQuery = productsQuery.or(`code.ilike.%${trimmed}%,name.ilike.%${trimmed}%`);
  const { data: products, error } = await productsQuery;
  if (error) throw new Error(error.message);
  if (!products || products.length === 0) return [];

  const { data: balances, error: balanceError } = await admin.rpc("get_department_balance", {
    p_department_id: departmentId,
    p_as_at_date: businessDay,
    p_product_ids: products.map((p) => p.id),
  });
  if (balanceError) throw new Error(balanceError.message);

  return (balances ?? []).slice(0, 20).map((b) => ({
    id: b.product_id,
    code: b.product_code,
    name: b.product_name,
    closingQty: b.closing_qty,
    unitCost: Number(b.unit_cost),
  }));
}

export async function postStockAdjustment(input: {
  departmentId: string;
  businessDay: string;
  productId: string;
  direction: "add" | "remove";
  quantity: number;
  category: string;
  note: string;
}) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  if (!input.departmentId) throw new Error("Choose a department.");
  if (!input.businessDay) throw new Error("Choose the business day.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Enter a whole number greater than zero.");
  const category = ADJUSTMENT_CATEGORIES.find((c) => c.value === input.category);
  if (!category) throw new Error("Choose a reason for this adjustment.");
  if (category.direction !== "both" && category.direction !== input.direction) {
    throw new Error(`"${category.label}" doesn't apply when ${input.direction === "add" ? "adding" : "removing"} stock.`);
  }
  if (!input.note.trim()) throw new Error("Add a note explaining this adjustment.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("post_stock_adjustment", {
    p_department_id: input.departmentId,
    p_business_day: input.businessDay,
    p_product_id: input.productId,
    p_delta: input.direction === "add" ? input.quantity : -input.quantity,
    p_category: category.value,
    p_note: input.note.trim(),
    p_created_by: profile.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/adjustments");
  revalidatePath("/ledger");
  revalidatePath("/reports");
  revalidatePath("/");
  return { id: data as string };
}

export type AdjustmentRow = {
  id: string;
  businessDay: string;
  createdAt: string;
  departmentId: string;
  departmentName: string;
  productCode: string;
  productName: string;
  delta: number;
  value: number;
  category: string | null;
  note: string | null;
  createdBy: string;
  createdByName: string;
  isReversal: boolean;
  isReversed: boolean;
};

export async function listAdjustments(filters: { departmentId?: string; from?: string; to?: string; q?: string; limit?: number } = {}): Promise<AdjustmentRow[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);
  const admin = createAdminClient();

  let query = admin.from("movements_detail").select("*").eq("type", "ADJUSTMENT");
  if (filters.departmentId) query = query.or(`from_department_id.eq.${filters.departmentId},to_department_id.eq.${filters.departmentId}`);
  if (filters.from) query = query.gte("business_day", filters.from);
  if (filters.to) query = query.lte("business_day", filters.to);
  if (filters.q?.trim()) {
    const t = filters.q.trim();
    query = query.or(`product_code.ilike.%${t}%,product_name.ilike.%${t}%`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(filters.limit ?? 500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => {
    const added = m.to_department_id != null;
    const sign = (added ? 1 : -1) * (m.reversal_of_movement_id ? -1 : 1);
    return {
      id: m.id!,
      businessDay: m.business_day!,
      createdAt: m.created_at!,
      departmentId: (m.to_department_id ?? m.from_department_id)!,
      departmentName: (m.to_department_name ?? m.from_department_name) ?? "—",
      productCode: m.product_code!,
      productName: m.product_name!,
      delta: sign * m.quantity!,
      value: sign * m.quantity! * Number(m.unit_cost ?? 0),
      category: m.adjustment_category,
      note: m.note,
      createdBy: m.created_by!,
      createdByName: m.created_by_name!,
      isReversal: m.reversal_of_movement_id != null,
      isReversed: m.reversed_by_movement_id != null,
    };
  });
}
