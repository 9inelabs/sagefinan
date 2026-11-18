"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "nextjs-toploader/app";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, LogOut, Search, X } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { ROLE_LABELS, type NavGroup, type NavItem } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";

// Dark + green redesign (see CLAUDE.md's follow-up): the sidebar owns the
// whole frame again — brand at the top, a business-day card, a "Jump to…"
// box that filters the nav (⌘K / Ctrl+K focuses it, Enter opens the first
// match), the role-filtered nav, and the signed-in user with sign-out at
// the bottom. Used both as the desktop sidebar and as the mobile drawer.
export function Sidebar({
  groups,
  profile,
  businessDayLabel,
  unreadCounts,
  onNavigate,
  onClose,
}: {
  groups: NavGroup[];
  profile: CurrentProfile;
  businessDayLabel: string;
  unreadCounts?: Record<string, number>;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // The clicked item highlights the instant it's tapped, not once the new route has
  // actually rendered — pathname only updates when navigation completes, which can
  // lag noticeably on a slow data fetch. Cleared as soon as pathname catches up.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seesAll = profile.role === "ADMIN" || profile.role === "AUDITOR";
  const initials = profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-frame flex flex-col h-full w-[236px] px-3.5 pt-5 pb-4 text-on-dark">
      <div className="flex items-center gap-2.5 px-1.5 pb-4.5 mb-4 border-b border-frame-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" className="w-7 h-auto flex-none invert" />
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-medium tracking-[-0.01em] truncate">De-Moon Hotel</b>
          <span className="block text-[11px] text-on-dark-mut">Stock Database</span>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close menu" className="w-8 h-8 grid place-items-center rounded text-on-dark-mut hover:text-on-dark">
            <X size={18} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2.5 bg-frame-2 border border-frame-line rounded-[12px] px-2.5 py-2">
        <div className="w-7.5 h-7.5 rounded-sm grid place-items-center flex-none bg-brand-bright text-frame">
          <CalendarDays size={15} strokeWidth={1.9} />
        </div>
        <div className="min-w-0">
          <span className="block text-[10.5px] text-on-dark-mut">Business day</span>
          <b className="block text-[12.5px] font-medium truncate">{businessDayLabel}</b>
        </div>
      </div>

      <label className="flex items-center gap-2 mt-3 mb-1 bg-frame-2 border border-frame-line rounded px-2.5 py-2 text-on-dark-mut focus-within:border-brand-bright/60">
        <Search size={14} strokeWidth={1.75} className="flex-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
            if (e.key === "Enter") {
              const first = filtered[0]?.items[0];
              if (first) {
                setQuery("");
                setPendingHref(first.href);
                onNavigate?.();
                router.push(first.href);
              }
            }
          }}
          placeholder="Jump to…"
          aria-label="Jump to a page"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12.5px] text-on-dark placeholder:text-on-dark-mut"
        />
        <kbd className="hidden min-[900px]:inline text-[10.5px] font-sans bg-frame-3 rounded-[5px] px-1.5">⌘K</kbd>
      </label>

      <nav className="nav-fade flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-4">
        {filtered.length === 0 ? <p className="px-2 pt-4 text-[12px] text-on-dark-mut">No page matches “{query}”.</p> : null}
        {filtered.map((group) => (
          <div key={group.title} className="pt-3.5">
            <p className="text-[10.5px] tracking-[0.08em] uppercase text-on-dark-mut px-2 pb-1.5">{group.title}</p>
            {group.items.map((item) => {
              const currentlyOn = matchesItem(item, pathname);
              const active = pendingHref ? pendingHref === item.href : currentlyOn && !isShadowedByChild(groups, item.href, pathname);
              const Icon = item.icon;
              const unread = unreadCounts?.[item.key] ?? 0;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => {
                    setQuery("");
                    if (!currentlyOn) setPendingHref(item.href);
                    onNavigate?.();
                  }}
                  className={`flex items-center gap-2.5 px-2 py-[5px] rounded text-[12.5px] mb-px transition-colors ${
                    active ? "bg-frame-3 text-white ring-1 ring-inset ring-frame-line" : "text-on-dark-2 hover:bg-frame-2 hover:text-white"
                  }`}
                >
                  <span
                    className={`w-6.5 h-6.5 rounded-sm grid place-items-center flex-none ${
                      active ? "bg-brand-bright text-frame" : "bg-frame-2 text-on-dark-mut"
                    }`}
                  >
                    <Icon size={15} strokeWidth={1.75} />
                  </span>
                  <span className="truncate flex-1">{item.label}</span>
                  {unread > 0 ? (
                    <span className="flex-none min-w-4.5 h-4.5 px-1 rounded-full bg-brand-bright text-frame text-[10.5px] font-medium leading-4.5 text-center tabular-nums">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-frame-line pt-3 mt-1">
        <p className="text-[10.5px] tracking-[0.08em] uppercase text-on-dark-mut px-2 pb-2">User account</p>
        <div className="flex items-center gap-2.5 pl-1.5">
          <div className="w-8.5 h-8.5 rounded-full grid place-items-center flex-none bg-brand-bright text-frame text-[12px] font-medium ring-2 ring-frame">
            {initials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <b className="block text-[12.5px] font-medium truncate">{profile.fullName}</b>
            <span className="block text-[11px] text-on-dark-mut truncate">
              {ROLE_LABELS[profile.role]}
              {!seesAll && profile.departmentName ? ` · ${profile.departmentName}` : ""}
            </span>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="w-8 h-8 rounded grid place-items-center text-on-dark-mut hover:bg-frame-2 hover:text-white"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function underPath(prefix: string, pathname: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesItem(item: NavItem, pathname: string) {
  if (item.href === "/") return pathname === "/";
  return underPath(item.href, pathname) || (item.matches ?? []).some((m) => underPath(m, pathname));
}

// "/requisitions" would otherwise also light up on "/requisitions/history",
// which belongs to Reports — prefer the most specific matching item.
function isShadowedByChild(groups: NavGroup[], href: string, pathname: string) {
  return groups.some((g) =>
    g.items.some(
      (i) => i.href !== href && [i.href, ...(i.matches ?? [])].some((p) => p.startsWith(`${href}/`) && underPath(p, pathname))
    )
  );
}
