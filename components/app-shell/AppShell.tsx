"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { DrawerContext } from "./drawer-context";
import type { NavGroup } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";

export function AppShell({
  profile,
  groups,
  children,
}: {
  profile: CurrentProfile;
  groups: NavGroup[];
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{ open: () => setDrawerOpen(true) }}>
      <div className="flex min-h-screen">
        <aside className="hidden min-[900px]:block flex-none sticky top-0 h-screen">
          <Sidebar profile={profile} groups={groups} />
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 min-[900px]:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0">
              <Sidebar profile={profile} groups={groups} onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </DrawerContext.Provider>
  );
}
