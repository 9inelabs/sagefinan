"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Filters = { department: string; date: string; q: string; hasMovement: boolean };

export function LedgerFilters({
  departments,
  showDepartmentPicker,
  initial,
}: {
  departments: { id: string; name: string }[];
  showDepartmentPicker: boolean;
  initial: Filters;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const firstRun = useRef(true);

  function navigate(next: Partial<Filters>) {
    const merged = { ...initial, q, ...next };
    const sp = new URLSearchParams();
    if (merged.department) sp.set("department", merged.department);
    if (merged.date) sp.set("date", merged.date);
    if (merged.q) sp.set("q", merged.q);
    if (merged.hasMovement) sp.set("hasMovement", "1");
    router.push(`/ledger?${sp.toString()}`);
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
      {showDepartmentPicker ? (
        <Select defaultValue={initial.department} onChange={(e) => navigate({ department: e.target.value })}>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      ) : null}
      <Input type="date" className="w-auto" defaultValue={initial.date} onChange={(e) => navigate({ date: e.target.value })} />
      <Input
        className="flex-1 min-w-[160px] w-auto"
        placeholder="Search product"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <label className="text-xs text-n600 flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          className="accent-teal w-4 h-4"
          defaultChecked={initial.hasMovement}
          onChange={(e) => navigate({ hasMovement: e.target.checked })}
        />
        With movement only
      </label>
    </div>
  );
}
