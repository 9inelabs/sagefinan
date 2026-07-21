"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function ProductsFilters({
  departments,
  initialQ,
  initialDepartment,
  initialStatus,
}: {
  departments: { id: string; name: string }[];
  initialQ: string;
  initialDepartment: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const firstRun = useRef(true);

  function navigate(next: { q?: string; department?: string; status?: string }) {
    const sp = new URLSearchParams();
    const merged = { q, department: initialDepartment, status: initialStatus, ...next };
    if (merged.q) sp.set("q", merged.q);
    if (merged.department) sp.set("department", merged.department);
    if (merged.status && merged.status !== "active") sp.set("status", merged.status);
    router.push(`/products?${sp.toString()}`);
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
      <Input
        className="flex-1 min-w-[180px] w-auto"
        placeholder="Search name or code"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Select defaultValue={initialDepartment} onChange={(e) => navigate({ department: e.target.value })}>
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Select defaultValue={initialStatus} onChange={(e) => navigate({ status: e.target.value })}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All statuses</option>
      </Select>
    </div>
  );
}
