"use client";

import { useRouter } from "next/navigation";
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
