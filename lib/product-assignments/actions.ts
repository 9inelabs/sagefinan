"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared between the department screen ("manage its full product list and
// shelf order") and the product screen ("tick which departments stock it") —
// both views edit the same product_assignments rows, just sliced by a
// different foreign key.

export type DepartmentAssignmentRow = {
  productId: string;
  code: string;
  name: string;
  unitCost: number;
  shelfOrder: number | null;
};

export async function listDepartmentAssignments(departmentId: string): Promise<DepartmentAssignmentRow[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_assignments")
    .select("shelf_order, products!inner(id, code, name, unit_cost, is_active)")
    .eq("department_id", departmentId)
    .eq("products.is_active", true);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      productId: row.products.id,
      code: row.products.code,
      name: row.products.name,
      unitCost: row.products.unit_cost,
      shelfOrder: row.shelf_order,
    }))
    .sort((a, b) => {
      if (a.shelfOrder != null && b.shelfOrder != null) return a.shelfOrder - b.shelfOrder;
      if (a.shelfOrder != null) return -1;
      if (b.shelfOrder != null) return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function searchUnassignedProducts(departmentId: string, query: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { data: assigned } = await admin.from("product_assignments").select("product_id").eq("department_id", departmentId);
  const assignedIds = (assigned ?? []).map((r) => r.product_id);

  let q = admin.from("products").select("id, code, name").eq("is_active", true).order("name").limit(20);
  if (query.trim()) q = q.or(`code.ilike.%${query.trim()}%,name.ilike.%${query.trim()}%`);
  if (assignedIds.length > 0) q = q.not("id", "in", `(${assignedIds.join(",")})`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addProductsToDepartment(departmentId: string, productIds: string[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);
  if (productIds.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("product_assignments")
    .upsert(
      productIds.map((productId) => ({ department_id: departmentId, product_id: productId })),
      { onConflict: "department_id,product_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/departments/${departmentId}`);
  revalidatePath("/products");
}

export async function removeProductFromDepartment(departmentId: string, productId: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { error } = await admin
    .from("product_assignments")
    .delete()
    .eq("department_id", departmentId)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);

  revalidatePath(`/departments/${departmentId}`);
  revalidatePath("/products");
}

export async function reorderDepartmentProducts(departmentId: string, orderedProductIds: string[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  await Promise.all(
    orderedProductIds.map((productId, index) =>
      admin
        .from("product_assignments")
        .update({ shelf_order: index + 1 })
        .eq("department_id", departmentId)
        .eq("product_id", productId)
    )
  );

  revalidatePath(`/departments/${departmentId}`);
}

export async function setShelfOrder(departmentId: string, productId: string, shelfOrder: number | null) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { error } = await admin
    .from("product_assignments")
    .update({ shelf_order: shelfOrder })
    .eq("department_id", departmentId)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);

  revalidatePath(`/departments/${departmentId}`);
}

// Product-edit-screen side: tick which departments stock this product.
export async function setProductDepartments(productId: string, departmentIds: string[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("product_assignments")
    .select("department_id")
    .eq("product_id", productId);
  if (currentError) throw new Error(currentError.message);

  const currentIds = new Set((current ?? []).map((r) => r.department_id));
  const nextIds = new Set(departmentIds);

  const toAdd = departmentIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    const { error } = await admin
      .from("product_assignments")
      .upsert(
        toAdd.map((departmentId) => ({ department_id: departmentId, product_id: productId })),
        { onConflict: "department_id,product_id", ignoreDuplicates: true }
      );
    if (error) throw new Error(error.message);
  }

  if (toRemove.length > 0) {
    const { error } = await admin
      .from("product_assignments")
      .delete()
      .eq("product_id", productId)
      .in("department_id", toRemove);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  for (const id of [...toAdd, ...toRemove]) revalidatePath(`/departments/${id}`);
}
