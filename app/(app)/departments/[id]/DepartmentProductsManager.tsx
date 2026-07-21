"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DepartmentAssignmentRow } from "@/lib/product-assignments/actions";
import {
  addProductsToDepartment,
  removeProductFromDepartment,
  reorderDepartmentProducts,
  searchUnassignedProducts,
  setShelfOrder,
} from "@/lib/product-assignments/actions";

function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function sortByShelfOrder(a: DepartmentAssignmentRow, b: DepartmentAssignmentRow) {
  if (a.shelfOrder != null && b.shelfOrder != null) return a.shelfOrder - b.shelfOrder;
  if (a.shelfOrder != null) return -1;
  if (b.shelfOrder != null) return 1;
  return a.name.localeCompare(b.name);
}

// Drag-to-reorder uses the native HTML5 drag-and-drop API rather than a new
// dependency — this manager is desktop-only for dragging (SPEC.md: dragging
// 100 rows on a phone is miserable), and native DnD's well-known touch-device
// weaknesses never come into play because mobile always uses the number
// input instead.
export function DepartmentProductsManager({
  departmentId,
  initialProducts,
}: {
  departmentId: string;
  initialProducts: DepartmentAssignmentRow[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; code: string; name: string }[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});
  const dragIndex = useRef<number | null>(null);
  let searchToken = 0;

  async function runSearch(q: string) {
    setSearch(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const token = ++searchToken;
    const data = await searchUnassignedProducts(departmentId, q);
    if (token === searchToken) setResults(data);
  }

  async function addSelected() {
    const ids = [...selectedToAdd];
    if (ids.length === 0) return;
    await addProductsToDepartment(departmentId, ids);
    setSelectedToAdd(new Set());
    setResults([]);
    setSearch("");
    router.refresh();
  }

  async function remove(productId: string) {
    setProducts((p) => p.filter((x) => x.productId !== productId));
    await removeProductFromDepartment(departmentId, productId);
    router.refresh();
  }

  function onDrop(index: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    setProducts((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      const reordered = next.map((p, i) => ({ ...p, shelfOrder: i + 1 }));
      reorderDepartmentProducts(
        departmentId,
        reordered.map((p) => p.productId)
      );
      return reordered;
    });
  }

  function orderValue(p: DepartmentAssignmentRow) {
    return orderDrafts[p.productId] ?? (p.shelfOrder != null ? String(p.shelfOrder) : "");
  }

  async function commitOrder(productId: string) {
    const raw = orderDrafts[productId];
    if (raw === undefined) return;
    setOrderDrafts((d) => {
      const next = { ...d };
      delete next[productId];
      return next;
    });
    const trimmed = raw.trim();
    const n = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (!Number.isFinite(n) || (n as number) < 0)) return;
    setProducts((prev) => prev.map((p) => (p.productId === productId ? { ...p, shelfOrder: n } : p)).sort(sortByShelfOrder));
    await setShelfOrder(departmentId, productId, n);
  }

  return (
    <div>
      <div className="p-4 border-b border-n200 flex flex-wrap gap-2 items-start">
        <div className="flex-1 min-w-[220px] relative">
          <Input placeholder="Search product by code or name to add" value={search} onChange={(e) => runSearch(e.target.value)} />
          {results.length > 0 ? (
            <div className="absolute z-10 mt-1 w-full bg-white border border-n200 rounded max-h-64 overflow-y-auto">
              {results.map((r) => (
                <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-n50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-teal w-4 h-4 flex-none"
                    checked={selectedToAdd.has(r.id)}
                    onChange={(e) => {
                      setSelectedToAdd((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      });
                    }}
                  />
                  <span className="text-n600 tabular-nums text-xs flex-none">{r.code}</span>
                  <span className="truncate">{r.name}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <Btn type="button" variant="acc" disabled={selectedToAdd.size === 0} onClick={addSelected}>
          Add{selectedToAdd.size > 0 ? ` ${selectedToAdd.size}` : ""} to department
        </Btn>
      </div>

      {products.length === 0 ? (
        <EmptyState title="No products assigned" description="Search above to add products this department stocks." />
      ) : (
        <>
          <div className="hidden min-[900px]:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["", "Order", "Code", "Name", "Unit cost", ""].map((h, i) => (
                    <th
                      key={h + i}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i === 4 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr
                    key={p.productId}
                    draggable
                    onDragStart={() => (dragIndex.current = i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    className="border-b border-n200 last:border-b-0 hover:bg-n50"
                  >
                    <td className="pl-4 h-9 w-6 text-n400 cursor-grab select-none" title="Drag to reorder">
                      ⠿
                    </td>
                    <td className="px-2 h-9 w-16">
                      <input
                        type="number"
                        inputMode="numeric"
                        className="w-14 px-2 py-1 border border-n200 rounded text-[13px] tabular-nums focus:outline-2 focus:outline-teal focus:-outline-offset-1"
                        value={orderValue(p)}
                        onChange={(e) => setOrderDrafts((d) => ({ ...d, [p.productId]: e.target.value }))}
                        onBlur={() => commitOrder(p.productId)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      />
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{p.code}</td>
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{p.name}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(p.unitCost)}</td>
                    <td className="px-4 h-9 text-right whitespace-nowrap">
                      <button type="button" onClick={() => remove(p.productId)} className="text-teal text-sm">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="min-[900px]:hidden divide-y divide-n200">
            {products.map((p) => (
              <div key={p.productId} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{p.name}</div>
                  <div className="text-xs text-n600 tabular-nums mt-0.5">
                    {p.code} · {formatNaira(p.unitCost)}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-n600 mb-1 text-center uppercase tracking-wide">Order</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-16 h-12 px-2 border border-n200 rounded text-center text-[15px] tabular-nums focus:outline-2 focus:outline-teal focus:-outline-offset-1"
                    value={orderValue(p)}
                    onChange={(e) => setOrderDrafts((d) => ({ ...d, [p.productId]: e.target.value }))}
                    onBlur={() => commitOrder(p.productId)}
                  />
                </div>
                <button type="button" onClick={() => remove(p.productId)} className="text-teal text-sm h-12 px-1 flex-none">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="p-4 border-t border-n200 text-xs text-n600">
        Products without an explicit order sort last, alphabetically. Drag rows to reorder on desktop, or type a number on any device.
      </div>
    </div>
  );
}
