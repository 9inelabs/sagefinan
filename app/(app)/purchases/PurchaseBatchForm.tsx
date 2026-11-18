"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, FileText, PackagePlus, Plus, Search, X } from "lucide-react";
import { Btn } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Tag } from "@/components/ui/Tag";
import { postPurchaseBatch, searchProductsForPurchase, type PurchaseProductResult } from "@/lib/movements/actions";
import type { ReceivablePurchaseOrder } from "@/lib/purchase-orders/actions";
import { formatPoNumber } from "@/lib/purchase-orders/format";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { formatNaira } from "@/lib/format";
import { formatWeekdayDate } from "@/lib/dates";

// Each line records the quantity received and the total amount paid for it
// (CLAUDE.md: "Purchase amounts…"). Quantity and amount stay editable in the
// batch, so a received purchase order — whose quantities are free text like
// "2 crates" — can be turned into bottle counts line by line.
type BatchLine = {
  productId: string;
  code: string;
  name: string;
  currentQty: number | null;
  quantity: string;
  amount: string;
  poQuantityText?: string | null;
};

function parseAmount(v: string) {
  const n = Number(v.replace(/[,₦\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function PurchaseBatchForm({
  initialBusinessDay,
  receivingPo = null,
}: {
  initialBusinessDay: string;
  receivingPo?: ReceivablePurchaseOrder | null;
}) {
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const [supplierName, setSupplierName] = useState(receivingPo?.supplierName ?? "");
  const [invoiceReference, setInvoiceReference] = useState("");

  const { query: search, results, searching, handleChange: runSearch, setDisplayText, setResults, reset: resetSearch } = useDebouncedSearch(
    (q: string) => searchProductsForPurchase(q, businessDay)
  );
  const [picked, setPicked] = useState<PurchaseProductResult | null>(null);
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [lines, setLines] = useState<BatchLine[]>(
    () =>
      receivingPo?.lines
        .filter((l) => l.currentQty !== null)
        .map((l) => ({
          productId: l.productId,
          code: l.code,
          name: l.name,
          currentQty: l.currentQty,
          quantity: "",
          amount: String(l.amount),
          poQuantityText: l.quantityText,
        })) ?? []
  );
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{
    supplierName: string;
    businessDay: string;
    lineCount: number;
    totalBottles: number;
    totalAmount: number;
  } | null>(null);

  const unassignedPoLines = receivingPo?.lines.filter((l) => l.currentQty === null) ?? [];

  function handleSearchChange(q: string) {
    setPicked(null);
    setAddError(null);
    runSearch(q);
  }

  function pick(product: PurchaseProductResult) {
    setPicked(product);
    setResults([]);
    setDisplayText(`${product.code} — ${product.name}`);
    setQty("");
    setAmount("");
    setAddError(null);
  }

  function addToBatch() {
    if (!picked) return;
    if (!picked.assignedToCentral || picked.availableQty === null) {
      setAddError("This product isn't assigned to the central store yet — assign it before purchasing.");
      return;
    }
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setAddError("Enter a positive whole number of bottles.");
      return;
    }
    const a = parseAmount(amount);
    if (amount.trim() === "" || !Number.isFinite(a) || a < 0) {
      setAddError("Enter the total amount paid for this line.");
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === picked.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === picked.id
            ? { ...l, quantity: String((Number(l.quantity) || 0) + n), amount: String((parseAmount(l.amount) || 0) + a) }
            : l
        );
      }
      return [
        ...prev,
        { productId: picked.id, code: picked.code, name: picked.name, currentQty: picked.availableQty, quantity: String(n), amount: String(a) },
      ];
    });
    setPicked(null);
    resetSearch();
    setQty("");
    setAmount("");
    setAddError(null);
  }

  function updateLine(productId: string, patch: Partial<BatchLine>) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
    setPostError(null);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  const lineProblems = useMemo(
    () =>
      lines
        .map((l) => {
          const q = Number(l.quantity);
          const a = parseAmount(l.amount);
          if (!Number.isInteger(q) || q <= 0) return `${l.name}: enter the bottles received`;
          if (l.amount.trim() === "" || !Number.isFinite(a) || a < 0) return `${l.name}: enter the amount paid`;
          return null;
        })
        .filter(Boolean) as string[],
    [lines]
  );

  const totalBottles = lines.reduce((sum, l) => sum + (Number.isInteger(Number(l.quantity)) ? Number(l.quantity) : 0), 0);
  const totalAmount = lines.reduce((sum, l) => sum + (Number.isFinite(parseAmount(l.amount)) ? parseAmount(l.amount) : 0), 0);

  async function post() {
    if (!supplierName.trim()) {
      setPostError("Enter the supplier's name.");
      return;
    }
    if (lineProblems.length > 0) {
      setPostError(lineProblems[0]);
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      await postPurchaseBatch({
        businessDay,
        supplierName,
        invoiceReference,
        purchaseOrderId: receivingPo?.id ?? null,
        lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), amount: parseAmount(l.amount) })),
      });
      setPosted({ supplierName, businessDay, lineCount: lines.length, totalBottles, totalAmount });
      setLines([]);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : "Could not post this purchase.");
    } finally {
      setPosting(false);
    }
  }

  function startNewBatch() {
    setPosted(null);
    setPostError(null);
    setSupplierName("");
    setInvoiceReference("");
    setBusinessDay(initialBusinessDay);
  }

  if (posted) {
    return (
      <div className="surface-hero rounded-premium px-6 py-10 min-[900px]:py-14 text-center animate-rise">
        <div className="mx-auto w-16 h-16 rounded-full grid place-items-center bg-brand-bright text-frame shadow-glow-lg animate-check-pop">
          <Check size={30} strokeWidth={2.4} />
        </div>
        <h2 className="mt-5 text-[24px] font-medium tracking-[-0.025em]">Purchase recorded</h2>
        <p className="mt-2 text-[13px] text-on-dark-2">
          {posted.supplierName} · business day {formatWeekdayDate(posted.businessDay)}
          {receivingPo ? ` · ${formatPoNumber(receivingPo.poNumber)} marked received` : ""}
        </p>
        <div className="mt-6 inline-grid grid-cols-3 divide-x divide-white/10 rounded-[16px] bg-white/[0.06] ring-1 ring-inset ring-white/10 text-left">
          <HeroStat label="Lines" value={String(posted.lineCount)} />
          <HeroStat label="Bottles" value={String(posted.totalBottles)} />
          <HeroStat label="Amount" value={formatNaira(posted.totalAmount)} />
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {receivingPo ? (
            <Link
              href="/purchases"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-brand-bright text-frame text-[13px] font-medium active:scale-[0.97] transition-transform"
            >
              <Plus size={16} strokeWidth={2.2} />
              Record another purchase
            </Link>
          ) : (
            <button
              type="button"
              onClick={startNewBatch}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-brand-bright text-frame text-[13px] font-medium active:scale-[0.97] transition-transform"
            >
              <Plus size={16} strokeWidth={2.2} />
              Record another purchase
            </button>
          )}
          <Link
            href="/reports/purchases"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-white/[0.08] ring-1 ring-inset ring-white/10 text-on-dark text-[13px] active:scale-[0.97] transition-transform"
          >
            <FileText size={15} strokeWidth={1.8} />
            View purchase receipts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
      <div className="grid grid-cols-1 gap-3 min-w-0">
        {receivingPo ? (
          <div className="surface-hero rounded-premium px-5 py-4 flex flex-wrap items-center justify-between gap-3 animate-rise">
            <div>
              <p className="text-[11.5px] text-on-dark-mut">Receiving approved purchase order</p>
              <p className="text-[18px] font-medium tracking-[-0.02em]">{formatPoNumber(receivingPo.poNumber)}</p>
            </div>
            <p className="text-[12px] text-on-dark-2 max-w-[420px]">
              Stock items from the order are listed below — enter the bottles actually received and check the amount paid.
              Posting marks the order received.
            </p>
          </div>
        ) : null}

        <section className="bg-white rounded-premium shadow-premium p-5">
          <h2 className="text-[14px] font-medium tracking-[-0.01em] mb-3.5">Purchase details</h2>
          <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-3.5">
            <LabeledField label="Business day">
              <Input type="date" value={businessDay} onChange={(e) => setBusinessDay(e.target.value)} />
            </LabeledField>
            <LabeledField label="Supplier name">
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Nigerian Breweries" />
            </LabeledField>
            <LabeledField label="Invoice / delivery note (optional)">
              <Input value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} placeholder="Reference number" />
            </LabeledField>
          </div>
        </section>

        <section className="bg-white rounded-premium shadow-premium p-5">
          <h2 className="text-[14px] font-medium tracking-[-0.01em]">Add a product</h2>
          <p className="text-[11.5px] text-n600 mt-0.5 mb-3.5">Search the central store&apos;s products, then enter the bottles received and the amount paid.</p>
          <div className="relative">
            <Search size={16} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-n400 pointer-events-none" />
            <input
              placeholder="Search by product code or name"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={`w-full h-11 rounded-[12px] bg-n50 border border-transparent pl-10 ${searching ? "pr-32" : "pr-4"} text-[13px] outline-none transition-[background-color,border-color,box-shadow] duration-200 focus:bg-white focus:border-brand-bright/50 focus:shadow-focus`}
            />
            {searching ? (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-n600" role="status">
                <Spinner size={15} />
                Searching…
              </span>
            ) : null}
            {results.length > 0 ? (
              <div className="absolute z-20 mt-2 w-full bg-white rounded-[14px] shadow-lift ring-1 ring-n200 max-h-72 overflow-y-auto p-1.5 animate-pop">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-colors hover:bg-brand-hover"
                  >
                    <span className="flex-none text-[11px] tabular-nums text-n600 bg-n100 rounded-sm px-1.5 py-0.5">{r.code}</span>
                    <span className="truncate flex-1">{r.name}</span>
                    {!r.assignedToCentral ? <Tag variant="warn">Not assigned</Tag> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {picked ? (
            <div key={picked.id} className="mt-4 rounded-[14px] ring-1 ring-n200 p-4 animate-rise">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium truncate">{picked.name}</p>
                  <p className="text-[11.5px] text-n600 mt-0.5">
                    {picked.code}
                    {picked.assignedToCentral && picked.availableQty !== null ? ` · ${picked.availableQty} in the central store now` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => {
                    setPicked(null);
                    resetSearch();
                  }}
                  className="w-8 h-8 rounded-full grid place-items-center text-n600 hover:bg-brand-hover"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
              {picked.assignedToCentral ? (
                <div className="mt-3 grid grid-cols-1 min-[600px]:grid-cols-[140px_200px_auto] gap-3 items-end">
                  <LabeledField label="Bottles received">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addToBatch()}
                      placeholder="0"
                    />
                  </LabeledField>
                  <LabeledField label="Amount paid (₦, line total)">
                    <Input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addToBatch()}
                      placeholder="0"
                    />
                  </LabeledField>
                  <Btn type="button" variant="acc" onClick={addToBatch} className="h-[34px] mb-3.5">
                    <Plus size={15} strokeWidth={2} className="text-brand-bright" />
                    Add to batch
                  </Btn>
                </div>
              ) : (
                <p className="mt-3 text-[12.5px] text-n600">This product isn&apos;t assigned to the central store yet — assign it before purchasing.</p>
              )}
              {qty && amount && Number(qty) > 0 && Number.isFinite(parseAmount(amount)) ? (
                <p className="text-[11.5px] text-n600 -mt-1">≈ {formatNaira(parseAmount(amount) / Number(qty))} per bottle</p>
              ) : null}
            </div>
          ) : null}

          {addError ? <p className="text-[12.5px] text-red mt-3 animate-pop">{addError}</p> : null}
        </section>

        {unassignedPoLines.length > 0 || (receivingPo?.unlinkedLines.length ?? 0) > 0 ? (
          <section className="bg-white rounded-premium shadow-premium p-5">
            <h2 className="text-[14px] font-medium">Not going into stock</h2>
            <p className="text-[11.5px] text-n600 mt-0.5 mb-3">
              These order items aren&apos;t stock products in the central store, so they aren&apos;t recorded here. They stay on the purchase order.
            </p>
            <ul className="divide-y divide-n200 text-[12.5px]">
              {[...unassignedPoLines.map((l) => ({ description: l.name, quantityText: l.quantityText, amount: l.amount })), ...(receivingPo?.unlinkedLines ?? [])].map((l, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span className="truncate">
                    {l.description}
                    {l.quantityText ? <span className="text-n600"> · {l.quantityText}</span> : null}
                  </span>
                  <span className="tabular-nums text-n600">{formatNaira(l.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="surface-dark rounded-premium min-[1100px]:sticky min-[1100px]:top-4 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">Batch</h2>
            <p className="text-[11.5px] text-on-dark-mut mt-0.5 truncate">
              {supplierName.trim() || "Supplier not set"} · {formatWeekdayDate(businessDay)}
            </p>
          </div>
          <span className="flex-none text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10 text-on-dark-2 tabular-nums">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="px-5 pb-6 pt-4 flex flex-col items-center text-center">
            <span className="w-12 h-12 rounded-full grid place-items-center bg-white/[0.06] ring-1 ring-inset ring-white/10 text-on-dark-mut">
              <PackagePlus size={20} strokeWidth={1.6} />
            </span>
            <p className="mt-3 text-[13px] font-medium">No lines yet</p>
            <p className="mt-1 text-[12px] text-on-dark-mut">Products you add appear here before you post.</p>
          </div>
        ) : (
          <ul className="px-3 max-h-[52vh] overflow-y-auto">
            {lines.map((l) => {
              const q = Number(l.quantity);
              return (
                <li key={l.productId} className="px-2 py-2.5 rounded-[12px] hover:bg-white/[0.04] animate-rise">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium truncate">{l.name}</p>
                      <p className="text-[11px] text-on-dark-mut tabular-nums mt-0.5">
                        {l.code}
                        {l.currentQty !== null ? ` · ${l.currentQty} in stock` : ""}
                        {Number.isInteger(q) && q > 0 && l.currentQty !== null ? ` → ${l.currentQty + q}` : ""}
                        {l.poQuantityText ? ` · ordered ${l.poQuantityText}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.productId)}
                      aria-label={`Remove ${l.name}`}
                      className="w-7 h-7 rounded-full grid place-items-center text-on-dark-mut hover:bg-white/10 hover:text-white flex-none"
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-[88px_1fr] gap-2">
                    <DarkInput label="Bottles" inputMode="numeric" value={l.quantity} onChange={(v) => updateLine(l.productId, { quantity: v })} />
                    <DarkInput label="Amount ₦" inputMode="decimal" value={l.amount} onChange={(v) => updateLine(l.productId, { amount: v })} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-5 pt-3 pb-5 mt-1 border-t border-white/[0.07]">
          <div className="flex items-end justify-between mb-1">
            <span className="text-[11.5px] text-on-dark-mut">Bottles</span>
            <span className="text-[15px] tabular-nums">{totalBottles}</span>
          </div>
          <div className="flex items-end justify-between mb-4">
            <span className="text-[11.5px] text-on-dark-mut">Total amount</span>
            <span className="text-[24px] font-medium tracking-[-0.03em] tabular-nums leading-none">{formatNaira(totalAmount)}</span>
          </div>
          {postError ? <p className="text-[12px] text-red-on-dark mb-3 animate-pop">{postError}</p> : null}
          <button
            type="button"
            onClick={post}
            disabled={lines.length === 0 || posting}
            className={`w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,background-color,filter] duration-200 active:scale-[0.98] ${
              posting
                ? "bg-frame-3 text-on-dark ring-1 ring-inset ring-white/10"
                : lines.length === 0
                  ? "bg-white/[0.06] text-on-dark-mut cursor-not-allowed"
                  : "bg-brand-bright text-frame hover:brightness-105 shadow-glow"
            }`}
          >
            {posting ? <Spinner size={16} /> : <Check size={16} strokeWidth={2.4} />}
            {posting ? "Posting…" : receivingPo ? "Receive & post purchase" : "Post purchase"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-[11.5px] text-n600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function DarkInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode: "numeric" | "decimal";
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-on-dark-mut mb-1">{label}</span>
      <input
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full h-9 rounded-[10px] bg-white/[0.06] border border-white/10 px-2.5 text-[13px] text-on-dark tabular-nums outline-none focus:border-brand-bright/60"
      />
    </label>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3">
      <span className="block text-[11px] text-on-dark-mut">{label}</span>
      <span className="block mt-0.5 text-[18px] font-medium tracking-[-0.02em] tabular-nums">{value}</span>
    </div>
  );
}
