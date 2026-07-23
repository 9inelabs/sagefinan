"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReasonCodeApplies = "VARIANCE" | "BOOK_DIFF" | "BOTH";

export type ReasonCodeRow = {
  id: string;
  code: string;
  label: string;
  appliesTo: ReasonCodeApplies;
  requiresNote: boolean;
  isActive: boolean;
};

function uniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function toMachineCode(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ADMIN/AUDITOR both need the active list to render reason chips on the
// Reconcile screen; only ADMIN can add or retire one (SPEC.md Access).
export async function listReasonCodes(includeInactive = true): Promise<ReasonCodeRow[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const admin = createAdminClient();
  let q = admin.from("reason_codes").select("id, code, label, applies_to, requires_note, is_active");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("created_at");
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    appliesTo: r.applies_to as ReasonCodeApplies,
    requiresNote: r.requires_note,
    isActive: r.is_active,
  }));
}

export async function createReasonCode(input: { label: string; appliesTo: ReasonCodeApplies; requiresNote: boolean }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const label = input.label.trim();
  if (!label) throw new Error("A label is required.");
  const code = toMachineCode(label);
  if (!code) throw new Error("That label doesn't produce a usable code — try letters or numbers.");

  const admin = createAdminClient();
  const { error } = await admin.from("reason_codes").insert({
    code,
    label,
    applies_to: input.appliesTo,
    requires_note: input.requiresNote,
  });
  if (error) {
    throw new Error(uniqueViolation(error) ? `A reason code equivalent to "${label}" already exists.` : error.message);
  }

  revalidatePath("/products/reason-codes");
}

// Retiring hides a code from new selections; it's never deleted, so every
// historical line that used it keeps showing its label (SPEC.md).
export async function setReasonCodeActive(id: string, isActive: boolean) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { error } = await admin.from("reason_codes").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/products/reason-codes");
}
