"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

export function InvestigationFilter({ departments, initial }: { departments: { id: string; name: string }[]; initial: string }) {
  const router = useRouter();

  return (
    <div className="px-4 py-2.5 border-b border-n200">
      <Select
        defaultValue={initial}
        onChange={(e) => router.push(e.target.value ? `/reconcile/investigation?department=${e.target.value}` : "/reconcile/investigation")}
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
