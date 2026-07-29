"use client";

import { Menu } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";

// Premium redesign's global top bar — brand + signed-in user + sign-out,
// content that used to live split across Sidebar.tsx's top and bottom
// blocks (see CLAUDE.md's follow-up on this). Full-width, above the
// sidebar, matching the reference's shell structure. Owns the mobile
// hamburger too, since it's now the persistent chrome PageShell no longer is.
export function Header({ profile, onOpenDrawer }: { profile: CurrentProfile; onOpenDrawer: () => void }) {
  const seesAll = profile.role === "ADMIN" || profile.role === "AUDITOR";

  return (
    <header className="flex-none bg-white border-b border-n200 px-4 min-[900px]:px-6 py-3.5 flex items-center justify-between gap-4 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="min-[900px]:hidden w-11 h-11 -ml-2 grid place-items-center flex-none text-ink"
        >
          <Menu size={20} strokeWidth={1.6} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" className="w-8 h-auto flex-none" />
        <div className="min-w-0">
          <b className="block text-[17px] font-medium tracking-tight text-ink truncate">De-Moon Hotel</b>
          <span className="block text-[11.5px] text-n600 mt-px truncate">Stock Database</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-none">
        <div className="text-right hidden min-[480px]:block">
          <b className="block text-sm font-medium text-ink">{profile.fullName}</b>
          <span className="block text-xs text-n600">
            {ROLE_LABELS[profile.role]}
            {seesAll ? "" : profile.departmentName ? ` · ${profile.departmentName}` : ""}
          </span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="px-4 py-2 rounded-full bg-charcoal-active text-white text-[11px] font-medium tracking-wide uppercase hover:brightness-125"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
