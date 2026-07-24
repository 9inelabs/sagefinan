"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MIN_LENGTH = 8;

// Self-service — the caller proves who they are by already holding a valid
// session (signed in with the temp password), not by an admin acting on
// their behalf. Only the must_change_password flip needs the admin client:
// profiles_update RLS is ADMIN-only (lib/users/actions.ts's same pattern),
// so a normal user's own session can never clear this flag directly — the
// "permission check in application code" here is simply that the row being
// updated is this session's own user id, never a client-supplied one.
export async function changePassword(formData: FormData) {
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < MIN_LENGTH) {
    redirect(`/change-password?error=${encodeURIComponent(`Password must be at least ${MIN_LENGTH} characters.`)}`);
  }
  if (newPassword !== confirmPassword) {
    redirect(`/change-password?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    redirect(`/change-password?error=${encodeURIComponent(error.message)}`);
  }

  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  if (profileError) {
    redirect(`/change-password?error=${encodeURIComponent("Password changed, but setup didn't finish — sign in again and contact an admin.")}`);
  }

  redirect("/");
}
