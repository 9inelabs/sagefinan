"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole, type UserRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

function generateTempPassword(length = 14): string {
  // Avoids visually ambiguous characters (0/O, 1/l/I) since this is read
  // aloud or retyped by hand when handed to the new user.
  const charset = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

function validateRoleDepartment(role: UserRole, departmentId: string | null, centralStoreId: string | null) {
  if (role === "ADMIN" || role === "AUDITOR") {
    if (departmentId) throw new Error(`${role === "ADMIN" ? "Admins" : "Auditors"} must not have a department assigned.`);
  } else if (role === "DEPARTMENT_USER") {
    if (!departmentId) throw new Error("Department users must have a department assigned.");
  } else if (role === "STOREKEEPER") {
    if (!departmentId) throw new Error("Storekeepers must be assigned to the central store.");
    if (departmentId !== centralStoreId) throw new Error("Storekeepers must be assigned to the central store.");
  }
}

async function countActiveAdmins(excludingId?: string) {
  const admin = createAdminClient();
  let query = admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "ADMIN").eq("is_active", true);
  if (excludingId) query = query.neq("id", excludingId);
  const { count } = await query;
  return count ?? 0;
}

export async function createUser(input: { fullName: string; email: string; role: UserRole; departmentId: string | null }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) throw new Error("Name is required.");
  if (!email) throw new Error("Email is required.");

  const admin = createAdminClient();
  const { data: central } = await admin.from("departments").select("id").eq("is_central_store", true).maybeSingle();
  validateRoleDepartment(input.role, input.departmentId, central?.id ?? null);

  const tempPassword = generateTempPassword();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authError) {
    throw new Error(authError.message.includes("already been registered") ? `A user with email "${email}" already exists.` : authError.message);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    full_name: fullName,
    role: input.role,
    department_id: input.departmentId,
  });
  if (profileError) {
    // Roll back the orphaned auth user so a failed profile insert doesn't
    // leave a login with no matching profile row.
    await admin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(profileError.message);
  }

  revalidatePath("/users");
  return { id: authUser.user.id, tempPassword };
}

export async function updateUser(
  id: string,
  input: { fullName: string; role: UserRole; departmentId: string | null; isActive: boolean }
) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Name is required.");

  if (id === profile.id && input.role !== profile.role) {
    throw new Error("You cannot change your own role.");
  }

  const admin = createAdminClient();
  const { data: current } = await admin.from("profiles").select("role, is_active").eq("id", id).single();
  if (!current) throw new Error("User not found.");

  const losingAdmin = current.role === "ADMIN" && (input.role !== "ADMIN" || !input.isActive);
  if (losingAdmin) {
    const remaining = await countActiveAdmins(id);
    if (remaining === 0) {
      throw new Error(
        input.isActive ? "This is the last active admin — assign another admin before changing this role." : "This is the last active admin — it cannot be deactivated."
      );
    }
  }

  const { data: central } = await admin.from("departments").select("id").eq("is_central_store", true).maybeSingle();
  validateRoleDepartment(input.role, input.departmentId, central?.id ?? null);

  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, role: input.role, department_id: input.departmentId, is_active: input.isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
}

export async function setUserActive(id: string, isActive: boolean) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();

  if (!isActive) {
    const { data: current } = await admin.from("profiles").select("role").eq("id", id).single();
    if (current?.role === "ADMIN") {
      const remaining = await countActiveAdmins(id);
      if (remaining === 0) throw new Error("This is the last active admin — it cannot be deactivated.");
    }
  }

  const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
}
