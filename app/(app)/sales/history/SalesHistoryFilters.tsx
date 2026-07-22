"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Filters = {
  q: string;
  department: string;
  from: string;
  to: string;
};

export function SalesHistoryFilters({
  departments,
  showDepartmentFilter,
  initial,
}: {
  departments: { id: string; name: string }[];
  showDepartmentFilter: boolean;
  initial: Filters;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const firstRun = useRef(true);

  function navigate(next: Partial<Filters>) {
    const sp = new URLSearchParams();
    const merged = { ...initial, q, ...next };
    if (merged.q) sp.set("q", merged.q);
    if (merged.department) sp.set("department", merged.department);
    if (merged.from) sp.set("from", merged.from);
    if (merged.to) sp.set("to", merged.to);
    router.push(`/sales/history?${sp.toString()}`);
  }

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => navigate({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="px-4 py-2.5 border-b border-n200 flex flex-wrap gap-2 items-center">
      <Input className="flex-1 min-w-[180px] w-auto" placeholder="Search product code or name" value={q} onChange={(e) => setQ(e.target.value)} />
      {showDepartmentFilter ? (
        <Select defaultValue={initial.department} onChange={(e) => navigate({ department: e.target.value })}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      ) : null}
      <label className="text-xs text-n600 flex items-center gap-1.5">
        From
        <Input type="date" className="w-auto" defaultValue={initial.from} onChange={(e) => navigate({ from: e.target.value })} />
      </label>
      <label className="text-xs text-n600 flex items-center gap-1.5">
        To
        <Input type="date" className="w-auto" defaultValue={initial.to} onChange={(e) => navigate({ to: e.target.value })} />
      </label>
    </div>
  );
}
