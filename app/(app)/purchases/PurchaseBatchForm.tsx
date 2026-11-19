"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  FileText,
  PackagePlus,
  Plus,
  Search,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { Btn } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Tag } from "@/components/ui/Tag";
import {
  postPurchaseBatch,
  searchProductsForPurchase,
  type PurchaseProductResult,
} from "@/lib/movements/actions";
import type { ReceivablePurchaseOrder } from "@/lib/purchase-orders/actions";
import { formatPoNumber } from "@/lib/purchase-orders/format";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { formatNaira } from "@/lib/format";
import { formatWeekdayDate } from "@/lib/dates";

// Two kinds of line (CLAUDE.md: "Unstocked purchase items…"):
// - stock: a product the central store stocks → whole-number quantity, goes
//   into the central store ledger;
// - unstocked: anything else bought (goat meat, diesel…) → free-text
//   quantity ("20kg") and amount, recorded on the purchase receipt only —
//   never stock, never a new product.
// Every line carries the total amount paid; quantity and amount stay
// editable in the batch so a received purchase order can be adjusted.
type StockLine = {
  kind: "stock";
  key: string;
  productId: string;
  code: string;
  name: string;
  currentQty: number | null;
  quantity: string;
  amount: string;
  poQuantityText?: string | null;
};
type UnstockedLine = {
  kind: "unstocked";
  key: string;
  description: string;
  quantityText: string;
  amount: string;
};
type BatchLine = StockLine | UnstockedLine;

let keySeq = 1;
const nextKey = () => `l${keySeq++}`;

function parseAmount(v: string) {
  const n = Number(v.replace(/[,₦\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function initialLines(po: ReceivablePurchaseOrder | null): BatchLine[] {
  if (!po) return [];
  const stock: BatchLine[] = po.lines.map((l) => ({
    kind: "stock",
    key: nextKey(),
    productId: l.productId,
    code: l.code,
    name: l.name,
    currentQty: l.currentQty,
    quantity: "",
    amount: String(l.amount),
    poQuantityText: l.quantityText,
  }));
  // Order lines not linked to a product are still part of what was bought —
  // they come across as unstocked lines, so they stay on the receipt.
  const unstocked: BatchLine[] = po.unlinkedLines.map((l) => ({
    kind: "unstocked",
    key: nextKey(),
    description: l.description,
    quantityText: l.quantityText ?? "",
    amount: String(l.amount),
  }));
  return [...stock, ...unstocked];
}

export function PurchaseBatchForm({
  initialBusinessDay,
  receivingPo = null,
}: {
  initialBusinessDay: string;
  receivingPo?: ReceivablePurchaseOrder | null;
}) {
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const [supplierName, setSupplierName] = useState(
    receivingPo?.supplierName ?? "",
  );
  const [invoiceReference, setInvoiceReference] = useState("");

  const {
    query: search,
    results,
    searching,
    handleChange: runSearch,
    setDisplayText,
    setResults,
    reset: resetSearch,
  } = useDebouncedSearch((q: string) =>
    searchProductsForPurchase(q, businessDay),
  );
  const [picked, setPicked] = useState<PurchaseProductResult | null>(null);
  const [unstocked, setUnstocked] = useState<string | null>(null); // description being added as an unstocked item
  const [qty, setQty] = useState("");
  const [qtyText, setQtyText] = useState("");
  const [amount, setAmount] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [lines, setLines] = useState<BatchLine[]>(() =>
    initialLines(receivingPo),
  );
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{
    supplierName: string;
    businessDay: string;
    stockLines: number;
    unstockedLines: number;
    totalQty: number;
    totalAmount: number;
  } | null>(null);

  function clearPick() {
    setPicked(null);
    setUnstocked(null);
    setQty("");
    setQtyText("");
    setAmount("");
    setAddError(null);
  }

  function handleSearchChange(q: string) {
    clearPick();
    runSearch(q);
  }

  function pick(product: PurchaseProductResult) {
    clearPick();
    setPicked(product);
    setResults([]);
    setDisplayText(`${product.code} — ${product.name}`);
  }

  function pickUnstocked(description: string) {
    clearPick();
    setUnstocked(description.trim());
    setResults([]);
    setDisplayText(description.trim());
  }

  function addToBatch() {
    const a = parseAmount(amount);
    if (amount.trim() === "" || !Number.isFinite(a) || a < 0) {
      setAddError("Enter the total amount paid for this line.");
      return;
    }
    if (unstocked !== null) {
      if (!unstocked) return setAddError("Describe what was bought.");
      setLines((prev) => [
        ...prev,
        {
          kind: "unstocked",
          key: nextKey(),
          description: unstocked,
          quantityText: qtyText.trim(),
          amount: String(a),
        },
      ]);
    } else if (picked) {
      const n = Number(qty);
      if (!Number.isInteger(n) || n <= 0) {
        setAddError("Enter a positive whole number.");
        return;
      }
      setLines((prev) => {
        const existing = prev.find(
          (l): l is StockLine =>
            l.kind === "stock" && l.productId === picked.id,
        );
        if (existing) {
          return prev.map((l) =>
            l === existing
              ? {
                  ...existing,
                  quantity: String((Number(existing.quantity) || 0) + n),
                  amount: String((parseAmount(existing.amount) || 0) + a),
                }
              : l,
          );
        }
        return [
          ...prev,
          {
            kind: "stock",
            key: nextKey(),
            productId: picked.id,
            code: picked.code,
            name: picked.name,
            currentQty: picked.availableQty ?? 0,
            quantity: String(n),
            amount: String(a),
          },
        ];
      });
    } else {
      return;
    }
    resetSearch();
    clearPick();
  }

  function updateLine(
    key: string,
    patch: Partial<StockLine> | Partial<UnstockedLine>,
  ) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? ({ ...l, ...patch } as BatchLine) : l)),
    );
    setPostError(null);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const lineProblems = lines
    .map((l) => {
      const a = parseAmount(l.amount);
      if (l.kind === "stock") {
        const q = Number(l.quantity);
        if (!Number.isInteger(q) || q <= 0)
          return `${l.name}: enter the quantity received`;
      } else if (!l.description.trim()) {
        return "An item is missing its description";
      }
      if (l.amount.trim() === "" || !Number.isFinite(a) || a < 0)
        return `${l.kind === "stock" ? l.name : l.description}: enter the amount paid`;
      return null;
    })
    .filter(Boolean) as string[];

  const stockLines = lines.filter((l): l is StockLine => l.kind === "stock");
  const unstockedLines = lines.filter(
    (l): l is UnstockedLine => l.kind === "unstocked",
  );
  const totalQty = stockLines.reduce(
    (sum, l) =>
      sum + (Number.isInteger(Number(l.quantity)) ? Number(l.quantity) : 0),
    0,
  );
  const totalAmount = lines.reduce(
    (sum, l) =>
      sum +
      (Number.isFinite(parseAmount(l.amount)) ? parseAmount(l.amount) : 0),
    0,
  );

  async function post() {
    if (!supplierName.trim()) return setPostError("Enter the supplier's name.");
    if (lineProblems.length > 0) return setPostError(lineProblems[0]);
    setPosting(true);
    setPostError(null);
    try {
      await postPurchaseBatch({
        businessDay,
        supplierName,
        invoiceReference,
        purchaseOrderId: receivingPo?.id ?? null,
        lines: lines.map((l) =>
          l.kind === "stock"
            ? {
                productId: l.productId,
                quantity: Number(l.quantity),
                amount: parseAmount(l.amount),
              }
            : {
                description: l.description,
                quantityText: l.quantityText,
                amount: parseAmount(l.amount),
              },
        ),
      });
      setPosted({
        supplierName,
        businessDay,
        stockLines: stockLines.length,
        unstockedLines: unstockedLines.length,
        totalQty,
        totalAmount,
      });
      setLines([]);
    } catch (e) {
      setPostError(
        e instanceof Error ? e.message : "Could not post this purchase.",
      );
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
        <h2 className="mt-5 text-[24px] font-medium tracking-[-0.025em]">
          Purchase recorded
        </h2>
        <p className="mt-2 text-[13px] text-on-dark-2">
          {posted.supplierName} · business day{" "}
          {formatWeekdayDate(posted.businessDay)}
          {receivingPo
            ? ` · ${formatPoNumber(receivingPo.poNumber)} marked received`
            : ""}
        </p>
        <div className="mt-6 inline-grid grid-cols-3 divide-x divide-white/10 rounded-[16px] bg-white/[0.06] ring-1 ring-inset ring-white/10 text-left">
          <HeroStat
            label="Into stock"
            value={`${posted.totalQty} units`}
          />
          <HeroStat
            label="Not stocked"
            value={`${posted.unstockedLines} item${posted.unstockedLines === 1 ? "" : "s"}`}
          />
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

  const showUnstockedOption =
    search.trim().length >= 2 && !searching && !picked && unstocked === null;

  return (
    <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
      <div className="grid grid-cols-1 gap-3 min-w-0">
        {receivingPo ? (
          <div className="surface-hero rounded-premium px-5 py-4 flex flex-wrap items-center justify-between gap-3 animate-rise">
            <div>
              <p className="text-[11.5px] text-on-dark-mut">
                Receiving approved purchase order
              </p>
              <p className="text-[18px] font-medium tracking-[-0.02em]">
                {formatPoNumber(receivingPo.poNumber)}
              </p>
            </div>
            <p className="text-[12px] text-on-dark-2 max-w-[440px]">
              The order&apos;s items are in the batch. Enter the quantity
              actually received for stock items and check every amount. Posting
              marks the order received.
            </p>
          </div>
        ) : null}

        <section className="bg-white rounded-premium shadow-premium p-5">
          <h2 className="text-[14px] font-medium tracking-[-0.01em] mb-3.5">
            Purchase details
          </h2>
          <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-3.5">
            <LabeledField label="Business day">
              <Input
                type="date"
                value={businessDay}
                onChange={(e) => setBusinessDay(e.target.value)}
              />
            </LabeledField>
            <LabeledField label="Supplier name">
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Nigerian Breweries"
              />
            </LabeledField>
            <LabeledField label="Invoice / delivery note (optional)">
              <Input
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
                placeholder="Reference number"
              />
            </LabeledField>
          </div>
        </section>

        <section className="bg-white rounded-premium shadow-premium p-5">
          <h2 className="text-[14px] font-medium tracking-[-0.01em]">
            Add an item
          </h2>
          <p className="text-[11.5px] text-n600 mt-0.5 mb-3.5">
            Type what was bought. A product the central store stocks goes into
            its ledger; anything else can be recorded on the receipt without
            going into stock.
          </p>
          <div className="relative">
            <Search
              size={16}
              strokeWidth={1.75}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-n400 pointer-events-none"
            />
            <input
              placeholder="Type a product or item, e.g. Hero, Goat meat"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={`w-full h-11 rounded-[12px] bg-n50 border border-transparent pl-10 ${searching ? "pr-32" : "pr-4"} text-[13px] outline-none transition-[background-color,border-color,box-shadow] duration-200 focus:bg-white focus:border-brand-bright/50 focus:shadow-focus`}
            />
            {searching ? (
              <span
                className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-n600"
                role="status"
              >
                <Spinner size={15} />
                Searching…
              </span>
            ) : null}
            {results.length > 0 || showUnstockedOption ? (
              <div className="absolute z-20 mt-2 w-full bg-white rounded-[14px] shadow-lift ring-1 ring-n200 max-h-80 overflow-y-auto p-1.5 animate-pop">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-colors hover:bg-brand-hover"
                  >
                    <span className="flex-none text-[11px] tabular-nums text-n600 bg-n100 rounded-sm px-1.5 py-0.5">
                      {r.code}
                    </span>
                    <span className="truncate flex-1">{r.name}</span>
                    {r.assignedToCentral ? (
                      <span className="text-[11px] text-n600 tabular-nums">
                        {r.availableQty} in store
                      </span>
                    ) : (
                      <Tag variant="acc">New to the store</Tag>
                    )}
                  </button>
                ))}
                {showUnstockedOption ? (
                  <button
                    type="button"
                    onClick={() => pickUnstocked(search)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-colors hover:bg-brand-hover ${
                      results.length > 0 ? "mt-1 border-t border-n100" : ""
                    }`}
                  >
                    <span className="flex-none w-6 h-6 rounded-full grid place-items-center bg-amber-soft text-amber">
                      <TagIcon size={13} strokeWidth={2} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">
                        Record “<b className="font-medium">{search.trim()}</b>”
                        as an item not tracked in stock
                      </span>
                      <span className="block text-[11px] text-n600">
                        Saved on the purchase receipt only — no stock, no new
                        product
                      </span>
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {picked ? (
            <div
              key={picked.id}
              className="mt-4 rounded-[14px] ring-1 ring-n200 p-4 animate-rise"
            >
              <PickedHeader
                title={picked.name}
                subtitle={
                  picked.assignedToCentral
                    ? `${picked.code} · ${picked.availableQty ?? 0} in the central store now — goes into its ledger`
                    : `${picked.code} · not stocked by the central store yet — posting adds it to the store's products and ledger`
                }
                onClear={() => {
                  clearPick();
                  resetSearch();
                }}
              />
              <div className="mt-3 grid grid-cols-1 min-[600px]:grid-cols-[140px_200px_auto] gap-3 items-end">
                <LabeledField label="Quantity received">
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
                <AddButton onClick={addToBatch} />
              </div>
              {qty &&
              amount &&
              Number(qty) > 0 &&
              Number.isFinite(parseAmount(amount)) ? (
                <p className="text-[11.5px] text-n600 -mt-1">
                  ≈ {formatNaira(parseAmount(amount) / Number(qty))} per unit
                </p>
              ) : null}
            </div>
          ) : null}

          {unstocked !== null ? (
            <div className="mt-4 rounded-[14px] ring-1 ring-amber/30 bg-amber-soft/40 p-4 animate-rise">
              <PickedHeader
                title={unstocked || "New item"}
                subtitle="Not tracked in stock — recorded on the purchase receipt for reference only"
                onClear={() => {
                  clearPick();
                  resetSearch();
                }}
              />
              <div className="mt-3 grid grid-cols-1 min-[600px]:grid-cols-[minmax(0,1fr)_160px_200px_auto] gap-3 items-end">
                <LabeledField label="Item">
                  <Input
                    value={unstocked}
                    onChange={(e) => setUnstocked(e.target.value)}
                  />
                </LabeledField>
                <LabeledField label="Quantity (optional)">
                  <Input
                    value={qtyText}
                    onChange={(e) => setQtyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addToBatch()}
                    placeholder="e.g. 20kg, 2 bags"
                  />
                </LabeledField>
                <LabeledField label="Amount paid (₦)">
                  <Input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addToBatch()}
                    placeholder="0"
                  />
                </LabeledField>
                <AddButton onClick={addToBatch} />
              </div>
            </div>
          ) : null}

          {addError ? (
            <p className="text-[12.5px] text-red mt-3 animate-pop">
              {addError}
            </p>
          ) : null}
        </section>
      </div>

      <aside className="surface-dark rounded-premium min-[1100px]:sticky min-[1100px]:top-4 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">
              Purchase
            </h2>
            <p className="text-[11.5px] text-on-dark-mut mt-0.5 truncate">
              {supplierName.trim() || "Supplier not set"} ·{" "}
              {formatWeekdayDate(businessDay)}
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
            <p className="mt-1 text-[12px] text-on-dark-mut">
              Items you add appear here before you post.
            </p>
          </div>
        ) : (
          <ul className="px-3 max-h-[56vh] overflow-y-auto">
            {lines.map((l) => (
              <li
                key={l.key}
                className="px-2 py-2.5 rounded-[12px] hover:bg-white/[0.04] animate-rise"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {l.kind === "stock" ? (
                      <>
                        <p className="text-[12.5px] font-medium truncate">
                          {l.name}
                        </p>
                        <p className="text-[11px] text-on-dark-mut tabular-nums mt-0.5">
                          {l.code}
                          {l.currentQty !== null
                            ? ` · ${l.currentQty} in store`
                            : ""}
                          {Number.isInteger(Number(l.quantity)) &&
                          Number(l.quantity) > 0 &&
                          l.currentQty !== null
                            ? ` → ${l.currentQty + Number(l.quantity)}`
                            : ""}
                          {l.poQuantityText
                            ? ` · ordered ${l.poQuantityText}`
                            : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <input
                          value={l.description}
                          onChange={(e) =>
                            updateLine(l.key, { description: e.target.value })
                          }
                          aria-label="Item"
                          className="w-full bg-transparent text-[12.5px] font-medium outline-none border-b border-transparent focus:border-white/20"
                        />
                        <p className="text-[11px] mt-0.5">
                          <span className="text-[10px] px-1.5 py-px rounded-sm bg-amber-soft/15 text-amber-soft ring-1 ring-inset ring-amber-soft/20">
                            Not stocked
                          </span>
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label="Remove line"
                    className="w-7 h-7 rounded-full grid place-items-center text-on-dark-mut hover:bg-white/10 hover:text-white flex-none"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-[96px_1fr] gap-2">
                  {l.kind === "stock" ? (
                    <DarkInput
                      label="Qty"
                      inputMode="numeric"
                      value={l.quantity}
                      onChange={(v) => updateLine(l.key, { quantity: v })}
                    />
                  ) : (
                    <DarkInput
                      label="Quantity"
                      inputMode="text"
                      placeholder="e.g. 20kg"
                      value={l.quantityText}
                      onChange={(v) => updateLine(l.key, { quantityText: v })}
                    />
                  )}
                  <DarkInput
                    label="Amount ₦"
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(v) => updateLine(l.key, { amount: v })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="px-5 pt-3 pb-5 mt-1 border-t border-white/[0.07]">
          <div className="flex items-end justify-between mb-1">
            <span className="text-[11.5px] text-on-dark-mut">
              Into the central store
            </span>
            <span className="text-[13px] tabular-nums">
              {totalQty} units
            </span>
          </div>
          <div className="flex items-end justify-between mb-1">
            <span className="text-[11.5px] text-on-dark-mut">Not stocked</span>
            <span className="text-[13px] tabular-nums">
              {unstockedLines.length} item
              {unstockedLines.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-end justify-between mt-3 mb-4">
            <span className="text-[11.5px] text-on-dark-mut">Total amount</span>
            <span className="text-[24px] font-medium tracking-[-0.03em] tabular-nums leading-none">
              {formatNaira(totalAmount)}
            </span>
          </div>
          {postError ? (
            <p className="text-[12px] text-red-on-dark mb-3 animate-pop">
              {postError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={post}
            disabled={lines.length === 0 || posting}
            className={`w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,filter,background-color] duration-200 active:scale-[0.98] ${
              posting
                ? "bg-frame-3 text-on-dark ring-1 ring-inset ring-white/10"
                : lines.length === 0
                  ? "bg-white/[0.06] text-on-dark-mut cursor-not-allowed"
                  : "bg-brand-bright text-frame hover:brightness-105 shadow-glow"
            }`}
          >
            {posting ? (
              <Spinner size={16} />
            ) : (
              <Check size={16} strokeWidth={2.4} />
            )}
            {posting
              ? "Posting…"
              : receivingPo
                ? "Receive & post purchase"
                : "Post purchase"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function PickedHeader({
  title,
  subtitle,
  onClear,
}: {
  title: string;
  subtitle: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[14px] font-medium truncate">{title}</p>
        <p className="text-[11.5px] text-n600 mt-0.5">{subtitle}</p>
      </div>
      <button
        type="button"
        aria-label="Clear selection"
        onClick={onClear}
        className="w-8 h-8 rounded-full grid place-items-center text-n600 hover:bg-brand-hover"
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Btn
      type="button"
      variant="acc"
      onClick={onClick}
      className="h-[34px] mb-3.5"
    >
      <Plus size={15} strokeWidth={2} className="text-brand-bright" />
      Add to purchase
    </Btn>
  );
}

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode: "numeric" | "decimal" | "text";
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] text-on-dark-mut mb-1">{label}</span>
      <input
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-[10px] bg-white/[0.06] border border-white/10 px-2.5 text-[13px] text-on-dark tabular-nums outline-none focus:border-brand-bright/60 placeholder:text-on-dark-mut/60"
      />
    </label>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-3">
      <span className="block text-[11px] text-on-dark-mut">{label}</span>
      <span className="block mt-0.5 text-[18px] font-medium tracking-[-0.02em] tabular-nums">
        {value}
      </span>
    </div>
  );
}
