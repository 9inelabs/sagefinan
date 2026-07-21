"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { createProduct, updateProduct } from "@/lib/products/actions";
import { setProductDepartments } from "@/lib/product-assignments/actions";

export function ProductForm({
  product,
  departments,
  initialDepartmentIds,
}: {
  product?: { id: string; code: string; name: string; unitCost: number };
  departments: { id: string; name: string }[];
  initialDepartmentIds?: string[];
}) {
  const router = useRouter();
  const [code, setCode] = useState(product?.code ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [unitCost, setUnitCost] = useState(product ? String(product.unitCost) : "");
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(new Set(initialDepartmentIds ?? []));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDepartment(id: string) {
    setDepartmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setPending(true);
    setError(null);

    const parsedCost = Number(unitCost);
    if (unitCost.trim() === "" || !Number.isFinite(parsedCost) || parsedCost < 0) {
      setError("Unit cost must be a number of zero or more.");
      setPending(false);
      return;
    }

    try {
      let id = product?.id;
      if (product) {
        await updateProduct(product.id, { code, name, unitCost: parsedCost });
      } else {
        const created = await createProduct({ code, name, unitCost: parsedCost });
        id = created.id;
      }
      await setProductDepartments(id!, [...departmentIds]);
      router.push("/products");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-x-4">
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BEV-0104" disabled={pending} />
        </Field>
        <Field label="Unit cost (₦)">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="0.00"
            disabled={pending}
            className="tabular-nums"
          />
        </Field>
      </div>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Heineken 33cl" disabled={pending} />
      </Field>

      <div className="mb-4">
        <p className="text-xs text-n600 mb-2">Departments that stock this product</p>
        {departments.length === 0 ? (
          <p className="text-sm text-n600">No departments yet — add one first.</p>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 min-[900px]:grid-cols-3 gap-y-2 gap-x-4">
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-teal w-4 h-4"
                  checked={departmentIds.has(d.id)}
                  onChange={() => toggleDepartment(d.id)}
                  disabled={pending}
                />
                {d.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-n600 mt-2">
          Shelf order for each department is set from that department&apos;s own screen, not here.
        </p>
      </div>

      {error ? <p className="text-sm text-red mb-3">{error}</p> : null}

      <div className="flex gap-2">
        <Btn type="button" variant="acc" disabled={pending || !code.trim() || !name.trim()} onClick={submit}>
          {pending ? "Saving…" : product ? "Save changes" : "Add product"}
        </Btn>
        <Btn type="button" onClick={() => router.push("/products")} disabled={pending}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
