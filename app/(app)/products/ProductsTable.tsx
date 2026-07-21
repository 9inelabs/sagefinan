"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Tag } from "@/components/ui/Tag";
import { setProductActive } from "@/lib/products/actions";
import { addProductsToDepartment } from "@/lib/product-assignments/actions";

type ProductRow = {
  id: string;
  code: string;
  name: string;
  unitCost: number;
  isActive: boolean;
  departments: string[];
};

function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export function ProductsTable({
  products,
  departments,
}: {
  products: ProductRow[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<string | null>(null);

  const allOnPageSelected = products.length > 0 && products.every((p) => selected.has(p.id));

  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(products.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignSelected() {
    if (!assignTo || selected.size === 0) return;
    setAssigning(true);
    await addProductsToDepartment(assignTo, [...selected]);
    setAssigning(false);
    setSelected(new Set());
    setAssignTo("");
    router.refresh();
  }

  async function toggleActive(id: string, isActive: boolean) {
    setPendingToggle(id);
    await setProductActive(id, !isActive);
    setPendingToggle(null);
    router.refresh();
  }

  return (
    <div>
      {selected.size > 0 ? (
        <div className="px-4 py-2.5 border-b border-n200 bg-n50 flex flex-wrap items-center gap-2">
          <span className="text-sm">{selected.size} selected</span>
          <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">Assign to department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Btn variant="acc" disabled={!assignTo || assigning} onClick={assignSelected}>
            {assigning ? "Assigning…" : "Assign"}
          </Btn>
        </div>
      ) : null}

      <div className="hidden min-[900px]:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-2 border-b border-n200 bg-n50 w-8">
                <input type="checkbox" className="accent-teal w-4 h-4" checked={allOnPageSelected} onChange={toggleAll} />
              </th>
              {["Code", "Name", "Unit cost", "Departments", "Status", ""].map((h, i) => (
                <th
                  key={h + i}
                  className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                    i === 2 ? "text-right" : ""
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                <td className="px-4 h-9">
                  <input type="checkbox" className="accent-teal w-4 h-4" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                </td>
                <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{p.code}</td>
                <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                  <Link href={`/products/${p.id}`} className="text-teal">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(p.unitCost)}</td>
                <td className="px-4 h-9 text-[13.5px] text-n600 max-w-[280px] truncate">
                  {p.departments.length > 0 ? p.departments.join(", ") : "—"}
                </td>
                <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                  {p.isActive ? <Tag variant="ok">Active</Tag> : <Tag variant="mut">Inactive</Tag>}
                </td>
                <td className="px-4 h-9 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-3">
                    <Link href={`/products/${p.id}`} className="text-teal text-sm">
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleActive(p.id, p.isActive)}
                      disabled={pendingToggle === p.id}
                      className="text-teal text-sm disabled:opacity-60"
                    >
                      {p.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="min-[900px]:hidden divide-y divide-n200">
        {products.map((p) => (
          <div key={p.id} className="p-4">
            <div className="flex items-start gap-3 mb-2">
              <input
                type="checkbox"
                className="accent-teal w-4 h-4 mt-1 flex-none"
                checked={selected.has(p.id)}
                onChange={() => toggleOne(p.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/products/${p.id}`} className="text-teal font-medium truncate">
                    {p.name}
                  </Link>
                  {p.isActive ? <Tag variant="ok">Active</Tag> : <Tag variant="mut">Inactive</Tag>}
                </div>
                <div className="text-xs text-n600 tabular-nums mt-0.5">
                  {p.code} · {formatNaira(p.unitCost)}
                </div>
                <div className="text-xs text-n600 mt-1">{p.departments.length > 0 ? p.departments.join(", ") : "No departments"}</div>
              </div>
            </div>
            <div className="flex gap-4 text-sm pl-7">
              <Link href={`/products/${p.id}`} className="text-teal">
                Edit
              </Link>
              <button
                type="button"
                onClick={() => toggleActive(p.id, p.isActive)}
                disabled={pendingToggle === p.id}
                className="text-teal disabled:opacity-60"
              >
                {p.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
