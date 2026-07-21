"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

function uniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createDepartment(input: { name: string; isCentralStore: boolean }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");

  const admin = createAdminClient();
  const { data, error } = await admin.from("departments").insert({ name }).select("id").single();
  if (error) {
    throw new Error(uniqueViolation(error) ? `A department named "${name}" already exists.` : error.message);
  }

  if (input.isCentralStore) {
    const { error: csError } = await admin.rpc("admin_set_central_store", { p_department_id: data.id });
    if (csError) throw new Error(csError.message);
  }

  revalidatePath("/departments");
  return { id: data.id as string };
}

export async function updateDepartment(id: string, input: { name: string; isCentralStore: boolean }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");

  const admin = createAdminClient();
  const { error } = await admin.from("departments").update({ name }).eq("id", id);
  if (error) {
    throw new Error(uniqueViolation(error) ? `A department named "${name}" already exists.` : error.message);
  }

  if (input.isCentralStore) {
    const { error: csError } = await admin.rpc("admin_set_central_store", { p_department_id: id });
    if (csError) throw new Error(csError.message);
  } else {
    // If this department currently holds the flag and the admin unchecked it
    // without picking a replacement, leave it as central store — the app
    // requires exactly one, and there's no other department to hand it to.
  }

  revalidatePath("/departments");
  revalidatePath(`/departments/${id}`);
}

export async function getDepartmentReferenceCounts(id: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const [movements, sessions, users, products] = await Promise.all([
    admin.from("movements").select("id", { count: "exact", head: true }).or(`from_department_id.eq.${id},to_department_id.eq.${id}`),
    admin.from("count_sessions").select("id", { count: "exact", head: true }).eq("department_id", id),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("department_id", id).eq("is_active", true),
    admin.from("product_assignments").select("id", { count: "exact", head: true }).eq("department_id", id),
  ]);

  return {
    movementCount: movements.count ?? 0,
    sessionCount: sessions.count ?? 0,
    userCount: users.count ?? 0,
    productCount: products.count ?? 0,
  };
}

export async function setDepartmentActive(id: string, isActive: boolean) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();

  if (!isActive) {
    const { data: department } = await admin.from("departments").select("is_central_store").eq("id", id).single();
    if (department?.is_central_store) {
      throw new Error("This is the central store — assign a different department as central store before deactivating it.");
    }
  }

  const { error } = await admin.from("departments").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/departments");
  revalidatePath(`/departments/${id}`);
}
