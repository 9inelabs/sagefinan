"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { navForRole } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";

// Premium redesign's shell (see CLAUDE.md's follow-up): Header spans the
// full width above everything, so the layout is now a vertical stack
// (header, then a sidebar+content row) rather than the old pure horizontal
// split. Fixed to the viewport height with the sidebar and content each
// scrolling independently within it — the sidebar's own nav stays visible
// regardless of how far the content is scrolled, same guarantee the old
// `sticky top-0 h-screen` sidebar gave, without needing to know Header's
// exact pixel height to compute an offset.
export function AppShell({ profile, children }: { profile: CurrentProfile; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const groups = navForRole(profile.role);

  return (
    <div className="h-screen flex flex-col">
      <Header profile={profile} onOpenDrawer={() => setDrawerOpen(true)} />
      <div className="flex-1 min-h-0 flex relative">
        <aside className="hidden min-[900px]:block flex-none h-full overflow-y-auto">
          <Sidebar groups={groups} />
        </aside>

        {drawerOpen ? (
          <div className="absolute inset-0 z-50 min-[900px]:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 h-full">
              <Sidebar groups={groups} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
