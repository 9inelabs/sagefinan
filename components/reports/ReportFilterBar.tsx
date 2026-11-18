"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Option = { value: string; label: string };

// Shared filter row for the Reports pages: date range, optional search,
// optional department and status selects. Writes everything to the URL so
// a filtered report is linkable and the server does the filtering.
export function ReportFilterBar({
  basePath,
  initial,
  searchPlaceholder,
  departments,
  statuses,
}: {
  basePath: string;
  initial: { from: string; to: string; q?: string; department?: string; status?: string };
  searchPlaceholder?: string;
  departments?: Option[];
  statuses?: Option[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q ?? "");

  function go(patch: Partial<typeof initial>) {
    const next = { ...initial, q, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) sp.set(k, v);
    router.push(`${basePath}${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2.5 mb-3">
      {searchPlaceholder ? (
        <form
          className="relative flex-1 min-w-[200px]"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q });
          }}
        >
          <Search size={15} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-n400 pointer-events-none" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== (initial.q ?? "") && go({ q })} placeholder={searchPlaceholder} className="pl-9 h-9.5" />
        </form>
      ) : null}
      {departments ? (
        <Select defaultValue={initial.department ?? ""} onChange={(e) => go({ department: e.target.value })} className="h-9.5">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      ) : null}
      {statuses ? (
        <Select defaultValue={initial.status ?? ""} onChange={(e) => go({ status: e.target.value })} className="h-9.5">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      ) : null}
      <label className="flex items-center gap-1.5 text-[11.5px] text-n600">
        From
        <Input type="date" defaultValue={initial.from} onChange={(e) => go({ from: e.target.value })} className="w-auto h-9.5" />
      </label>
      <label className="flex items-center gap-1.5 text-[11.5px] text-n600">
        To
        <Input type="date" defaultValue={initial.to} onChange={(e) => go({ to: e.target.value })} className="w-auto h-9.5" />
      </label>
    </div>
  );
}
