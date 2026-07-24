import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type CurrentProfile = {
  id: string;
  fullName: string;
  role: UserRole;
  departmentId: string | null;
  departmentName: string | null;
  mustChangePassword: boolean;
};

// Reads the signed-in user's profile for use in Server Components/layouts.
// Middleware already guarantees a session exists for any non-public route;
// if the profile row is somehow missing, treat it as unauthenticated.
export const getCurrentProfile = cache(async (): Promise<CurrentProfile> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, department_id, is_active, must_change_password, departments(name)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Deactivating a user must block sign-in immediately, not just hide nav
  // items — a session created before deactivation is still valid to Supabase
  // Auth, so this check (run on every protected page/action via
  // getCurrentProfile) is what actually cuts them off.
  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=" + encodeURIComponent("This account has been deactivated."));
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    departmentId: profile.department_id,
    departmentName: profile.departments?.name ?? null,
    mustChangePassword: profile.must_change_password,
  };
});

// Guards a page/layout to a set of allowed roles. Call after getCurrentProfile().
export function requireRole(profile: CurrentProfile, allowed: UserRole[]) {
  if (!allowed.includes(profile.role)) {
    redirect("/");
  }
}
