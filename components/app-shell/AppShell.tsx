"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { navForRole } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/client";
import { markMessagesRead } from "@/lib/messages/actions";

// Premium redesign's shell (see CLAUDE.md's follow-up): Header spans the
// full width above everything, so the layout is now a vertical stack
// (header, then a sidebar+content row) rather than the old pure horizontal
// split. Fixed to the viewport height with the sidebar and content each
// scrolling independently within it — the sidebar's own nav stays visible
// regardless of how far the content is scrolled, same guarantee the old
// `sticky top-0 h-screen` sidebar gave, without needing to know Header's
// exact pixel height to compute an offset.
//
// This is also where the Messages nav badge lives (SPEC.md/CLAUDE.md's
// unread-count follow-up): AppShell wraps every route and stays mounted
// across client-side navigation within (app) — unlike a per-page
// component, a single Realtime subscription set up here survives moving
// between screens, which is what lets the badge update live without the
// user ever opening /messages.
export function AppShell({
  profile,
  initialUnreadMessages,
  children,
}: {
  profile: CurrentProfile;
  initialUnreadMessages: number;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const groups = navForRole(profile.role);
  const pathname = usePathname();

  const [unreadMessages, setUnreadMessages] = useState(initialUnreadMessages);
  const onMessagesPage = pathname.startsWith("/messages");
  const onMessagesPageRef = useRef(onMessagesPage);
  useEffect(() => {
    onMessagesPageRef.current = onMessagesPage;
  }, [onMessagesPage]);

  // Entering /messages clears the badge immediately; leaving marks read
  // again so anything that arrived live while the user was actually looking
  // at the panel (never counted below, since the Realtime handler skips
  // incrementing while onMessagesPageRef is true) doesn't get retroactively
  // flagged unread on the next hard reload.
  useEffect(() => {
    if (onMessagesPage) {
      setUnreadMessages(0);
      markMessagesRead().catch(() => {});
      return () => {
        markMessagesRead().catch(() => {});
      };
    }
  }, [onMessagesPage]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Same SSR-session race as MessagesPanel.tsx's own subscription — wait
    // for the hydrated session before opening the channel, or RLS silently
    // filters every row.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel("messages-unread-badge")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          const row = payload.new as { author_id: string };
          if (row.author_id === profile.id) return; // never unread for the sender
          if (onMessagesPageRef.current) {
            // Already visible in the open panel — keep the server-side read
            // marker current in real time rather than relying solely on the
            // "leaving /messages" cleanup below, which is a fire-and-forget
            // call that can lose a race against navigation (a hard nav can
            // abort it entirely) and never actually persist.
            markMessagesRead().catch(() => {});
            return;
          }
          setUnreadMessages((n) => n + 1);
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [profile.id]);

  return (
    <div className="h-screen flex flex-col">
      <Header profile={profile} onOpenDrawer={() => setDrawerOpen(true)} />
      <div className="flex-1 min-h-0 flex relative">
        <aside className="hidden min-[900px]:block flex-none h-full overflow-y-auto">
          <Sidebar groups={groups} unreadCounts={{ messages: unreadMessages }} />
        </aside>

        {drawerOpen ? (
          <div className="absolute inset-0 z-50 min-[900px]:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 h-full">
              <Sidebar groups={groups} unreadCounts={{ messages: unreadMessages }} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
