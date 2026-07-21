"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProductInput = { code: string; name: string; unitCost: number };

function validateInput(input: ProductInput) {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) throw new Error("Code is required.");
  if (!name) throw new Error("Name is required.");
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) {
    throw new Error("Unit cost must be a number of zero or more.");
  }
  return { code, name, unitCost: input.unitCost };
}

async function assertCodeAvailable(code: string, excludingId?: string) {
  const admin = createAdminClient();
  let query = admin.from("products").select("id, name").eq("code", code);
  if (excludingId) query = query.neq("id", excludingId);
  const { data: existing } = await query.maybeSingle();
  if (existing) {
    throw new Error(`Code "${code}" is already used by "${existing.name}".`);
  }
}

export async function createProduct(input: ProductInput) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const { code, name, unitCost } = validateInput(input);
  await assertCodeAvailable(code);

  const admin = createAdminClient();
  const { data, error } = await admin.from("products").insert({ code, name, unit_cost: unitCost }).select("id").single();
  if (error) throw new Error(error.message);

  revalidatePath("/products");
  return { id: data.id as string };
}

export async function updateProduct(id: string, input: ProductInput) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const { code, name, unitCost } = validateInput(input);
  await assertCodeAvailable(code, id);

  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ code, name, unit_cost: unitCost }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
}

export async function setProductActive(id: string, isActive: boolean) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
}
