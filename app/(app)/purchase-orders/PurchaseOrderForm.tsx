"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Check, Link2, Plus, Send, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { approvePurchaseOrder, savePurchaseOrder, type PurchaseOrderDetail } from "@/lib/purchase-orders/actions";
import { searchProductsForPurchase, type PurchaseProductResult } from "@/lib/movements/actions";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { formatNaira } from "@/lib/format";

// A purchase order line mirrors the hotel's paper PO: free-text description,
// free-text quantity ("5 paints", "1/2 bag"), and the line's total price.
// Typing a description suggests matching stock products; picking one links
// the line, which is what lets it be received into stock later. Unlinked
// lines (fresh food, diesel, knives…) are fine — they just never become stock.
type Line = {
  key: number;
  description: string;
  quantityText: string;
  amount: string;
  productId: string | null;
  productCode: string | null;
};

let nextKey = 1;
function blankLine(): Line {
  return { key: nextKey++, description: "", quantityText: "", amount: "", productId: null, productCode: null };
}

function parseAmount(v: string) {
  const n = Number(v.replace(/[,₦\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

// `approver` (an ADMIN reviewing a PENDING order) adds a "Save & approve"
// action: the approver can fill in missing prices/quantities and change any
// line, then approve in one step. Approval needs every line priced; the
// storekeeper may submit with prices or quantities still blank.
export function PurchaseOrderForm({ initial, today, approver = false }: { initial: PurchaseOrderDetail | null; today: string; approver?: boolean }) {
  const router = useRouter();
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? today);
  const [supplierName, setSupplierName] = useState(initial?.supplierName ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    initial && initial.lines.length > 0
      ? initial.lines.map((l) => ({
          key: nextKey++,
          description: l.description,
          quantityText: l.quantityText ?? "",
          amount: l.amount == null ? "" : String(l.amount),
          productId: l.productId,
          productCode: l.productCode,
        }))
      : [blankLine(), blankLine(), blankLine()]
  );
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const [saving, setSaving] = useState<null | "save" | "approve">(null);
  const [error, setError] = useState<string | null>(null);

  const { results, searching, handleChange: suggest, setResults, reset } = useDebouncedSearch((q: string) =>
    searchProductsForPurchase(q, today)
  );

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function linkProduct(key: number, p: PurchaseProductResult) {
    update(key, { description: p.name, productId: p.id, productCode: p.code });
    setResults([]);
    setActiveKey(null);
  }

  const filled = lines.filter((l) => l.description.trim() || l.amount.trim() || l.quantityText.trim());
  const total = filled.reduce((s, l) => s + (l.amount.trim() && Number.isFinite(parseAmount(l.amount)) ? parseAmount(l.amount) : 0), 0);
  const unpriced = filled.filter((l) => !l.amount.trim()).length;

  async function submit(andApprove: boolean) {
    setError(null);
    for (const [i, l] of filled.entries()) {
      if (!l.description.trim()) return setError(`Item ${i + 1} needs a description.`);
      if (l.amount.trim()) {
        const a = parseAmount(l.amount);
        if (!Number.isFinite(a) || a < 0) return setError(`Item ${i + 1} (${l.description}): the price must be a number.`);
      } else if (andApprove) {
        return setError(`Item ${i + 1} (${l.description}) needs a price before the order can be approved.`);
      }
    }
    if (filled.length === 0) return setError("Add at least one item.");
    setSaving(andApprove ? "approve" : "save");
    try {
      const { id } = await savePurchaseOrder({
        id: initial?.id ?? null,
        orderDate,
        supplierName,
        notes,
        lines: filled.map((l) => ({
          description: l.description,
          quantityText: l.quantityText,
          amount: l.amount.trim() ? parseAmount(l.amount) : null,
          productId: l.productId,
        })),
      });
      if (andApprove) await approvePurchaseOrder(id);
      router.push(`/purchase-orders/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this purchase order.");
      setSaving(null);
    }
  }

  return (
    <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
      <div className="grid grid-cols-1 gap-3 min-w-0">
        <section className="bg-white rounded-premium shadow-premium p-5 animate-rise">
          <div className="grid grid-cols-1 min-[700px]:grid-cols-[180px_1fr] gap-x-4">
            <label className="block mb-3.5">
              <span className="block text-[11.5px] text-n600 mb-1.5">Order date</span>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </label>
            <label className="block mb-3.5">
              <span className="block text-[11.5px] text-n600 mb-1.5">Supplier (optional)</span>
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Mile 12 market, Nigerian Breweries" />
            </label>
          </div>
          <label className="block">
            <span className="block text-[11.5px] text-n600 mb-1.5">Note for the approver (optional)</span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. weekend restock, kitchen running low on proteins" />
          </label>
        </section>

        <section className="bg-white rounded-premium shadow-premium animate-rise [animation-delay:60ms]">
          <div className="px-5 pt-5 pb-2 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-medium tracking-[-0.01em]">Items</h2>
              <p className="text-[11.5px] text-n600 mt-0.5">
                Type what you&apos;re buying. Pick a suggestion to link a stock product so it can be received into stock later.
              </p>
            </div>
          </div>

          <div className="hidden min-[800px]:grid grid-cols-[36px_minmax(0,1fr)_150px_150px_36px] gap-2 px-5 pb-1.5 text-[11px] text-n600">
            <span>#</span>
            <span>Description</span>
            <span>Qty</span>
            <span className="text-right pr-1">Total price (₦)</span>
            <span />
          </div>

          <ol className="px-3 pb-2">
            {lines.map((l, i) => (
              <li
                key={l.key}
                className="relative grid grid-cols-[28px_minmax(0,1fr)_36px] min-[800px]:grid-cols-[36px_minmax(0,1fr)_150px_150px_36px] gap-2 items-start px-2 py-1.5 rounded-[12px] hover:bg-brand-hover/60"
              >
                <span className="text-[12px] text-n600 tabular-nums pt-2.5 text-right pr-1">{i + 1}</span>
                <div className="min-w-0 relative">
                  <div className="relative">
                    <Input
                      value={l.description}
                      onFocus={() => setActiveKey(l.key)}
                      onBlur={() => setTimeout(() => setActiveKey((k) => (k === l.key ? null : k)), 150)}
                      onChange={(e) => {
                        update(l.key, { description: e.target.value, productId: null, productCode: null });
                        setActiveKey(l.key);
                        if (e.target.value.trim().length >= 2) suggest(e.target.value);
                        else reset();
                      }}
                      placeholder="e.g. Fresh Tomato, Hero, Diesel"
                      className={l.productId ? "pr-24" : ""}
                    />
                    {l.productId ? (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10.5px] text-brand bg-brand-soft rounded-sm px-1.5 py-0.5">
                        <Link2 size={11} strokeWidth={2} />
                        Stock item
                      </span>
                    ) : null}
                  </div>
                  {activeKey === l.key && (searching || results.length > 0) ? (
                    <div className="absolute z-20 mt-1.5 w-full bg-white rounded-[12px] shadow-lift ring-1 ring-n200 max-h-60 overflow-y-auto p-1 animate-pop">
                      {searching ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-n600">
                          <Spinner size={14} />
                          Looking for matching stock products…
                        </div>
                      ) : (
                        results.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => linkProduct(l.key, r)}
                            className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-[12.5px] hover:bg-brand-hover disabled:opacity-50"
                          >
                            <span className="flex-none text-[10.5px] tabular-nums text-n600 bg-n100 rounded-sm px-1.5 py-0.5">{r.code}</span>
                            <span className="truncate flex-1">{r.name}</span>
                            {!r.assignedToCentral ? <span className="text-[10.5px] text-brand">new to the store</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2 mt-2 min-[800px]:hidden">
                    <Input value={l.quantityText} onChange={(e) => update(l.key, { quantityText: e.target.value })} placeholder="Qty, e.g. 2 crates" />
                    <Input inputMode="decimal" value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} placeholder="Price ₦ (optional)" className="text-right" />
                  </div>
                </div>
                <Input
                  value={l.quantityText}
                  onChange={(e) => update(l.key, { quantityText: e.target.value })}
                  placeholder="e.g. 2 crates"
                  className="hidden min-[800px]:block"
                />
                <Input
                  inputMode="decimal"
                  value={l.amount}
                  onChange={(e) => update(l.key, { amount: e.target.value })}
                  placeholder="optional"
                  className="hidden min-[800px]:block text-right tabular-nums"
                />
                <button
                  type="button"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== l.key) : [blankLine()]))}
                  className="w-8.5 h-8.5 rounded-full grid place-items-center text-n400 hover:text-red hover:bg-red-soft transition-colors"
                >
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ol>
          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine()])}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] text-brand bg-brand-soft hover:brightness-95 active:scale-[0.97] transition"
            >
              <Plus size={15} strokeWidth={2} />
              Add item
            </button>
          </div>
        </section>
      </div>

      <aside className="surface-dark rounded-premium p-5 min-[1100px]:sticky min-[1100px]:top-4 animate-rise [animation-delay:120ms]">
        <p className="text-[11.5px] text-on-dark-mut">{initial ? "Editing purchase order" : "New purchase order"}</p>
        <p className="mt-1 text-[13px] text-on-dark-2">
          {filled.length} item{filled.length === 1 ? "" : "s"} · {filled.filter((l) => l.productId).length} linked to stock
        </p>
        <div className="mt-5 flex items-end justify-between">
          <span className="text-[11.5px] text-on-dark-mut">Total</span>
          <span className="text-[28px] font-medium tracking-[-0.03em] tabular-nums leading-none">{formatNaira(total)}</span>
        </div>
        {unpriced > 0 ? (
          <p className="mt-2 text-[11.5px] text-amber-soft">
            {unpriced} item{unpriced === 1 ? "" : "s"} without a price{approver ? " — add them to approve" : " — the approver can add them"}
          </p>
        ) : null}
        <p className="mt-4 text-[11.5px] text-on-dark-mut leading-relaxed">
          {approver
            ? "Fill in any missing prices or quantities and change anything you need, then approve. The storekeeper sees the approved version."
            : "Prices and quantities can be left blank — the admin can fill them in before approving. Once approved the order can be downloaded as a PDF and received into stock when the goods arrive."}
        </p>
        {error ? <p className="mt-3 text-[12px] text-red-on-dark animate-pop">{error}</p> : null}
        {approver ? (
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={saving !== null}
            className={`mt-4 w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,filter] duration-200 active:scale-[0.98] ${
              saving === "approve" ? "bg-frame-3 text-on-dark ring-1 ring-inset ring-white/10" : "bg-brand-bright text-frame hover:brightness-105 shadow-glow"
            }`}
          >
            {saving === "approve" ? <Spinner size={16} /> : <Check size={16} strokeWidth={2.4} />}
            {saving === "approve" ? "Approving…" : "Save & approve"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={saving !== null}
          className={`${approver ? "mt-2 bg-white/[0.06] ring-1 ring-inset ring-white/10 text-on-dark hover:bg-white/10" : "mt-4 bg-brand-bright text-frame hover:brightness-105 shadow-glow"} w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,filter] duration-200 active:scale-[0.98] ${
            saving === "save" ? "!bg-frame-3 !text-on-dark ring-1 ring-inset ring-white/10" : ""
          }`}
        >
          {saving === "save" ? <Spinner size={16} /> : <Send size={15} strokeWidth={2} />}
          {saving === "save" ? "Saving…" : approver ? "Save without approving" : initial ? "Save & resubmit for approval" : "Submit for approval"}
        </button>
        <Link
          href={initial ? `/purchase-orders/${initial.id}` : "/purchase-orders"}
          className="mt-2 w-full h-9 rounded-[12px] inline-flex items-center justify-center gap-1.5 text-[12px] text-on-dark-mut hover:text-on-dark hover:bg-white/[0.05]"
        >
          <X size={14} strokeWidth={1.75} />
          Cancel
        </Link>
        {initial?.status === "REJECTED" && initial.rejectionReason ? (
          <div className="mt-4 rounded-[12px] bg-white/[0.05] ring-1 ring-inset ring-white/10 p-3 text-[11.5px] text-on-dark-2">
            <span className="text-red-on-dark">Rejected:</span> {initial.rejectionReason}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
