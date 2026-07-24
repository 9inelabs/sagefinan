"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";

type Filters = { department: string; from: string; to: string };

export function PeriodSummaryFilters({
  departments,
  initial,
}: {
  departments: { id: string; name: string }[];
  initial: Filters;
}) {
  const router = useRouter();

  function navigate(next: Partial<Filters>) {
    const merged = { ...initial, ...next };
    const sp = new URLSearchParams();
    if (merged.department) sp.set("department", merged.department);
    if (merged.from) sp.set("from", merged.from);
    if (merged.to) sp.set("to", merged.to);
    router.push(`/reconcile/reports/period-summary?${sp.toString()}`);
  }

  return (
    <div className="px-4 py-2.5 border-b border-n200 flex flex-wrap gap-2 items-center">
      <Select defaultValue={initial.department} onChange={(e) => navigate({ department: e.target.value })}>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
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
