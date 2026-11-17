"use client";

import { useRouter } from "nextjs-toploader/app";
import { Select } from "@/components/ui/Select";

export function DashboardDepartmentFilter({
  departments,
  initial,
}: {
  departments: { id: string; name: string }[];
  initial: string;
}) {
  const router = useRouter();

  return (
    <Select
      className="h-9.5 border-transparent shadow-premium min-w-0 max-w-[60vw]"
      defaultValue={initial}
      onChange={(e) => router.push(e.target.value ? `/?department=${e.target.value}` : "/")}
    >
      <option value="">All departments</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );
}
