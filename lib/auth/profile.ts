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
    .select("id, full_name, role, department_id, departments(name)")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    departmentId: profile.department_id,
    departmentName: profile.departments?.name ?? null,
  };
});

// Guards a page/layout to a set of allowed roles. Call after getCurrentProfile().
export function requireRole(profile: CurrentProfile, allowed: UserRole[]) {
  if (!allowed.includes(profile.role)) {
    redirect("/");
  }
}
