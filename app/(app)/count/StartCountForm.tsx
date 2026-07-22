"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { startOrOpenCountSession } from "@/lib/counts/actions";

export function StartCountForm({
  departments,
  initialAsAtDate,
}: {
  departments: { id: string; name: string; is_central_store: boolean }[];
  initialAsAtDate: string;
}) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [asAtDate, setAsAtDate] = useState(initialAsAtDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const { id, status } = await startOrOpenCountSession(departmentId, asAtDate);
      router.push(status === "DRAFT" ? `/count/${id}` : `/compare/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this count.");
      setPending(false);
    }
  }

  return (
    <Card title="Start or open a count">
      <div className="p-4 max-w-md">
        <Field label="Department">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full">
            <option value="">Select a department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_central_store ? " (central store)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="As at date" hint="Physical stock is compared as at close of business on this date.">
          <Input type="date" value={asAtDate} onChange={(e) => setAsAtDate(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-red mb-3">{error}</p> : null}
        <Btn variant="acc" onClick={start} disabled={!departmentId || !asAtDate || pending} className="w-full h-10">
          {pending ? "Opening…" : "Start / open count"}
        </Btn>
        <p className="text-xs text-n600 mt-3">
          If a count for this department and date is already in progress, it opens instead of starting a duplicate.
        </p>
      </div>
    </Card>
  );
}
