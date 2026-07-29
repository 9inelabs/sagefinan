"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_LENGTH = 2000;

export type MessageRow = {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
};

// Server-rendered history on page load — everything after this comes from
// the Realtime subscription in MessagesPanel.tsx, not another call here.
// author_name/author_role are denormalized onto the row itself (not joined
// from profiles) since a browser's Realtime subscription can't join —
// profiles_select's RLS only allows a user to read their own row or an
// admin to read any, so a live INSERT payload for someone else's message
// couldn't otherwise be resolved to a name client-side. See the
// 20260729090100 migration and postMessage() below.
export async function listRecentMessages(limit = 100): Promise<MessageRow[]> {
  await getCurrentProfile(); // every role may read; this just confirms a session exists

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .select("id, author_id, author_name, author_role, body, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((m) => ({
      id: m.id,
      authorId: m.author_id,
      authorName: m.author_name,
      authorRole: m.author_role,
      body: m.body,
      createdAt: m.created_at,
    }))
    .reverse(); // oldest -> newest for display
}

// Every role may post — this is a shared room, not a scoped screen. No
// update/delete counterpart exists anywhere in this module: messages are
// permanent, same rule movements already lives by (see SPEC.md).
export async function postMessage(body: string) {
  const profile = await getCurrentProfile();

  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message can't be empty.");
  if (trimmed.length > MAX_BODY_LENGTH) throw new Error(`Message can't be longer than ${MAX_BODY_LENGTH} characters.`);

  const admin = createAdminClient();
  const { error } = await admin
    .from("messages")
    .insert({ author_id: profile.id, author_name: profile.fullName, author_role: profile.role, body: trimmed });
  if (error) throw new Error(error.message);

  // Not required for the live view (Realtime handles that for anyone with
  // the page open), but keeps a fresh server-rendered load consistent.
  revalidatePath("/messages");
}
