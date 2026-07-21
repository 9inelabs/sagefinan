"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { ROLE_LABELS, type NavGroup } from "@/lib/nav";
import type { CurrentProfile } from "@/lib/auth/profile";

export function Sidebar({
  profile,
  groups,
  onNavigate,
}: {
  profile: CurrentProfile;
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sees_all = profile.role === "ADMIN" || profile.role === "AUDITOR";

  return (
    <div className="flex flex-col h-full w-[212px] bg-ink text-white">
      <div className="flex items-center gap-2.5 px-4 pt-[18px] pb-3.5 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" className="w-[26px] h-auto flex-none invert" />
        <div>
          <b className="block text-[15px] font-medium tracking-tight">Sagefinan</b>
          <span className="block text-[11px] text-n400 mt-px">Grand Hotel</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title} className="px-2.5 pt-3.5 pb-1">
            <p className="text-[11px] text-n400 px-2 pb-1.5 tracking-wide uppercase">{group.title}</p>
            {group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={onNavigate}
                  className={`block w-full text-left px-2.5 py-2 rounded text-[13.5px] mb-px transition-colors ${
                    active ? "bg-teal text-white" : "text-[#D1D5DB] hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto px-3.5 py-3 border-t border-white/10">
        <div className="text-xs text-n400">
          <b className="block text-white text-sm font-medium">{profile.fullName}</b>
          {ROLE_LABELS[profile.role]}
          {sees_all ? " · All departments" : profile.departmentName ? ` · ${profile.departmentName}` : ""}
        </div>
        <form action={signOut} className="mt-2">
          <button type="submit" className="text-xs text-n400 hover:text-white">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
