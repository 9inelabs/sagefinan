"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { createDepartment, updateDepartment } from "@/lib/departments/actions";

export function DepartmentForm({
  department,
}: {
  department?: { id: string; name: string; isCentralStore: boolean };
}) {
  const router = useRouter();
  const [name, setName] = useState(department?.name ?? "");
  const [isCentralStore, setIsCentralStore] = useState(department?.isCentralStore ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasCentralStore = department?.isCentralStore ?? false;
  const centralStoreNote = isCentralStore
    ? wasCentralStore
      ? "This department is the central store."
      : "Saving will make this the central store and unflag whichever department currently holds it — there can only be one."
    : wasCentralStore
      ? "This department is currently the central store. Unchecking here has no effect on its own — flag a different department as central store to hand it off."
      : "There is exactly one central store; check this only for the department that receives purchases and issues requisitions.";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      if (department) {
        await updateDepartment(department.id, { name, isCentralStore });
        router.refresh();
      } else {
        const { id } = await createDepartment({ name, isCentralStore });
        router.push(`/departments/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
      return;
    }
    setPending(false);
  }

  return (
    <div className="p-4">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bar" disabled={pending} />
      </Field>

      <label className="flex items-center gap-2 text-sm mb-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          className="accent-teal w-4 h-4"
          checked={isCentralStore}
          disabled={pending}
          onChange={(e) => setIsCentralStore(e.target.checked)}
        />
        This is the central store
      </label>
      <p className="text-xs text-n600 mb-3.5">{centralStoreNote}</p>

      {error ? <p className="text-sm text-red mb-3">{error}</p> : null}

      <div className="flex gap-2">
        <Btn type="button" variant="acc" disabled={pending || !name.trim()} onClick={submit}>
          {pending ? "Saving…" : department ? "Save changes" : "Add department"}
        </Btn>
        <Btn type="button" onClick={() => router.push("/departments")} disabled={pending}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
