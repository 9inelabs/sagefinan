"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { postMessage, type MessageRow } from "@/lib/messages/actions";
import { ROLE_LABELS } from "@/lib/nav";
import type { UserRole } from "@/lib/auth/profile";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function roleLabel(role: string) {
  return ROLE_LABELS[role as UserRole] ?? role;
}

export function MessagesPanel({ initialMessages, currentUserId }: { initialMessages: MessageRow[]; currentUserId: string }) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Realtime, not polling: every open /messages tab (any role) subscribes to
  // INSERTs on the messages table, gated by that table's messages_select RLS
  // policy — the poster's own message comes back through this same channel
  // rather than being optimistically rendered first, so there's one single
  // source of truth for what actually got posted (see CLAUDE.md's follow-up
  // on this feature for why).
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // createBrowserClient hydrates its session from cookies asynchronously —
    // subscribing before that finishes opens the channel with no JWT, so
    // auth.uid() is null for that connection and messages_select's RLS
    // silently filters out every row (including the sender's own), with no
    // error surfaced anywhere. Explicitly awaiting the session first (the
    // documented Supabase pattern for this exact SSR race) makes sure
    // Realtime authenticates as the signed-in user before it subscribes.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("messages-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const row = payload.new as {
            id: string;
            author_id: string;
            author_name: string;
            author_role: string;
            body: string;
            created_at: string;
          };
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, {
            id: row.id,
            authorId: row.author_id,
            authorName: row.author_name,
            authorRole: row.author_role,
            body: row.body,
            createdAt: row.created_at,
          }]));
        })
        .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await postMessage(trimmed);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Team messages" extra={connected ? "Live" : "Connecting…"}>
      <div className="h-[60vh] min-h-[360px] overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 ? (
          <p className="text-sm text-n600 m-auto">No messages yet — be the first to say something.</p>
        ) : (
          messages.map((m) => {
            const isMe = m.authorId === currentUserId;
            return (
              <div key={m.id} className={`max-w-[80%] ${isMe ? "self-end items-end" : "self-start items-start"} flex flex-col`}>
                <div className="text-xs text-n600 mb-0.5 px-1">
                  {isMe ? "You" : m.authorName} <span className="text-n400">· {roleLabel(m.authorRole)}</span>{" "}
                  <span className="tabular-nums">· {formatTime(m.createdAt)}</span>
                </div>
                <div className={`rounded px-3 py-2 text-sm whitespace-pre-wrap break-words ${isMe ? "bg-graphite text-white" : "bg-n50 border border-n200 text-ink"}`}>
                  {m.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      <div className="p-3 border-t border-n200">
        {error ? <p className="text-sm text-red mb-2">{error}</p> : null}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
            placeholder="Message everyone…"
            rows={1}
            maxLength={2000}
            className="flex-1 resize-none px-[11px] py-[7px] border border-n200 rounded text-[13.5px] text-ink placeholder:text-n400 bg-white focus:outline-2 focus:outline-graphite focus:-outline-offset-1 focus:border-graphite disabled:bg-n50"
          />
          <Btn type="button" variant="acc" onClick={send} disabled={sending || !draft.trim()}>
            Send
          </Btn>
        </div>
      </div>
    </Card>
  );
}
