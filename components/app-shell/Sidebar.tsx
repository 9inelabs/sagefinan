"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "@/lib/nav";

// Premium redesign (see CLAUDE.md's follow-up): nav only now — brand and
// signed-in user info moved up into Header.tsx, which is why this no
// longer needs a `profile` prop at all (nav items are already filtered by
// role upstream in navForRole()).
export function Sidebar({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  // The clicked item highlights the instant it's tapped, not once the new route has
  // actually rendered — pathname only updates when navigation completes, which can
  // lag noticeably on a slow data fetch. Cleared as soon as pathname catches up.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <div className="flex flex-col h-full w-[224px] bg-charcoal">
      <nav className="flex-1 overflow-y-auto py-4">
        {groups.map((group) => (
          <div key={group.title} className="px-3 pb-4">
            <p className="text-[13px] font-medium text-white/85 px-2.5 pb-2">{group.title}</p>
            {group.items.map((item) => {
              const currentlyOn = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const active = currentlyOn || pendingHref === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => {
                    if (!currentlyOn) setPendingHref(item.href);
                    onNavigate?.();
                  }}
                  className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-premium text-[13.5px] mb-0.5 transition-colors ${
                    active ? "bg-charcoal-active text-white font-medium" : "text-charcoal-muted hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon size={17} strokeWidth={1.75} className="flex-none" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
