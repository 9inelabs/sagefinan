"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { MessagesButton } from "./MessagesButton";
import { ShellContext } from "./shell-context";
import { LoadingPill } from "@/components/ui/Spinner";
import { ReceiptDrawerProvider } from "@/components/receipt/ReceiptDrawer";
import { Sidebar } from "./Sidebar";
import { navForRole } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/client";
import { markMessagesRead } from "@/lib/messages/actions";

// Dark + green redesign's shell (see CLAUDE.md's follow-up): the whole
// viewport is the dark frame; the sidebar sits directly on it (desktop) or
// slides in as a drawer (mobile, opened from the top bar), and every page
// renders inside one rounded, independently-scrolling canvas panel inset
// into the frame. The sidebar's nav stays visible whatever the scroll
// position, since only the panel scrolls.
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
  pendingPurchaseOrders = 0,
  businessDayLabel,
  children,
}: {
  profile: CurrentProfile;
  initialUnreadMessages: number;
  // Admin-only "waiting for approval" count, refreshed on navigation via the
  // layout (approve/reject revalidate it) — not live like messages.
  pendingPurchaseOrders?: number;
  businessDayLabel: string;
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
    <ShellContext.Provider value={{ unreadMessages }}>
      <div className="app-frame h-dvh flex">
        {/* Shown from the moment a navigation starts until it lands (see .loading-pill). */}
        <LoadingPill />
        <aside className="hidden min-[900px]:block flex-none h-full" data-print-hide>
          <Sidebar groups={groups} profile={profile} businessDayLabel={businessDayLabel} unreadCounts={{ messages: unreadMessages, "purchase-orders": pendingPurchaseOrders }} />
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 min-[900px]:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 h-full shadow-lift">
              <Sidebar
                groups={groups}
                profile={profile}
                businessDayLabel={businessDayLabel}
                unreadCounts={{ messages: unreadMessages, "purchase-orders": pendingPurchaseOrders }}
                onNavigate={() => setDrawerOpen(false)}
                onClose={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 min-w-0 flex flex-col h-full min-[900px]:py-2.5 min-[900px]:pr-2.5">
          {/* Mobile top bar — hamburger, brand, messages. Desktop has the sidebar instead. */}
          <div className="min-[900px]:hidden flex-none flex items-center justify-between gap-3 px-4 py-3 text-on-dark" data-print-hide>
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="w-9.5 h-9.5 rounded grid place-items-center flex-none bg-frame-2 border border-frame-line"
              >
                <Menu size={18} strokeWidth={1.75} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" className="w-6 h-auto flex-none invert" />
              <b className="text-[14.5px] font-medium truncate">De-Moon Hotel</b>
            </div>
            <MessagesButton dark />
          </div>

          <main className="flex-1 min-h-0 overflow-y-auto bg-canvas rounded-t-panel min-[900px]:rounded-panel">
            <ReceiptDrawerProvider>{children}</ReceiptDrawerProvider>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
