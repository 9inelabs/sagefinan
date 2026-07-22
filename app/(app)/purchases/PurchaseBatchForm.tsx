"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { postPurchaseBatch, searchProductsForPurchase, type PurchaseProductResult } from "@/lib/movements/actions";

type BatchLine = {
  productId: string;
  code: string;
  name: string;
  currentQty: number;
  quantity: number;
};

export function PurchaseBatchForm({ initialBusinessDay }: { initialBusinessDay: string }) {
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PurchaseProductResult[]>([]);
  const [picked, setPicked] = useState<PurchaseProductResult | null>(null);
  const [qty, setQty] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const searchToken = useRef(0);

  const [lines, setLines] = useState<BatchLine[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ supplierName: string; businessDay: string; lineCount: number; totalBottles: number } | null>(
    null
  );

  async function runSearch(q: string) {
    setSearch(q);
    setPicked(null);
    setAddError(null);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const token = ++searchToken.current;
    const data = await searchProductsForPurchase(q, businessDay);
    if (token === searchToken.current) setResults(data);
  }

  function pick(product: PurchaseProductResult) {
    setPicked(product);
    setResults([]);
    setSearch(`${product.code} — ${product.name}`);
    setQty("");
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
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === picked.id);
      if (existing) {
        return prev.map((l) => (l.productId === picked.id ? { ...l, quantity: l.quantity + n } : l));
      }
      return [...prev, { productId: picked.id, code: picked.code, name: picked.name, currentQty: picked.availableQty!, quantity: n }];
    });
    setPicked(null);
    setSearch("");
    setQty("");
    setAddError(null);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function post() {
    setPosting(true);
    setPostError(null);
    try {
      await postPurchaseBatch({
        businessDay,
        supplierName,
        invoiceReference,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      setPosted({
        supplierName,
        businessDay,
        lineCount: lines.length,
        totalBottles: lines.reduce((sum, l) => sum + l.quantity, 0),
      });
      setLines([]);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : "Could not post this batch.");
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
      <Card title="Purchase posted">
        <div className="p-6 text-sm leading-relaxed">
          <p className="mb-4">
            Recorded <b className="font-medium">{posted.lineCount}</b> line{posted.lineCount === 1 ? "" : "s"} totalling{" "}
            <b className="font-medium tabular-nums">{posted.totalBottles}</b> bottles from{" "}
            <b className="font-medium">{posted.supplierName}</b> for business day{" "}
            <b className="font-medium tabular-nums">{posted.businessDay}</b>.
          </p>
          <Btn variant="acc" onClick={startNewBatch}>
            Start a new batch
          </Btn>
        </div>
      </Card>
    );
  }

  const totalBottles = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Purchase details">
        <div className="p-4 grid grid-cols-1 min-[600px]:grid-cols-3 gap-3.5">
          <Field label="Business day">
            <Input type="date" value={businessDay} onChange={(e) => setBusinessDay(e.target.value)} />
          </Field>
          <Field label="Supplier name">
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Nigerian Breweries" />
          </Field>
          <Field label="Invoice / delivery note (optional)">
            <Input value={invoiceReference} onChange={(e) => setInvoiceReference(e.target.value)} placeholder="Reference number" />
          </Field>
        </div>
      </Card>

      <Card title="Add to batch">
        <div className="p-4">
          <Field label="Product">
            <div className="relative">
              <Input placeholder="Search code or name" value={search} onChange={(e) => runSearch(e.target.value)} />
              {results.length > 0 ? (
                <div className="absolute z-10 mt-1 w-full bg-white border border-n200 rounded max-h-64 overflow-y-auto shadow-sm">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => pick(r)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-n50"
                    >
                      <span className="text-n600 tabular-nums text-xs flex-none">{r.code}</span>
                      <span className="truncate flex-1">{r.name}</span>
                      {!r.assignedToCentral ? <span className="text-xs text-amber flex-none">Not assigned</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Field>

          {picked ? (
            <>
              <div className="text-xs text-n600 mb-3">
                {picked.assignedToCentral && picked.availableQty !== null ? (
                  <>
                    Central store holds <b className="text-ink font-medium tabular-nums">{picked.availableQty}</b> bottles of this
                    product as at {businessDay}.
                  </>
                ) : (
                  "This product isn't assigned to the central store yet — assign it before purchasing."
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Bottles">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="w-28"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Btn type="button" variant="acc" onClick={addToBatch} className="h-9">
                  Add to batch
                </Btn>
              </div>
            </>
          ) : null}

          {addError ? <p className="text-sm text-red mt-3">{addError}</p> : null}
        </div>
      </Card>

      <Card title="Batch" extra={`${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalBottles} bottles`}>
        {lines.length === 0 ? (
          <EmptyState title="No lines yet" description="Search a product above and add it to this batch to get started." />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Product", "Code", "Current qty", "Adding", "Resulting qty", ""].map((h, i) => (
                      <th
                        key={h + i}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i > 1 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.productId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{l.name}</td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{l.code}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{l.currentQty}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right text-green font-medium tabular-nums whitespace-nowrap">
                        +{l.quantity}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap">
                        {l.currentQty + l.quantity}
                      </td>
                      <td className="px-4 h-9 text-right whitespace-nowrap">
                        <button type="button" onClick={() => removeLine(l.productId)} className="text-teal text-sm">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {lines.map((l) => (
                <div key={l.productId} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{l.name}</div>
                      <div className="text-xs text-n600 tabular-nums mt-0.5">{l.code}</div>
                    </div>
                    <button type="button" onClick={() => removeLine(l.productId)} className="text-teal text-sm flex-none">
                      Remove
                    </button>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-n600 tabular-nums">
                    <span>Current {l.currentQty}</span>
                    <span className="text-green">+{l.quantity}</span>
                    <span className="text-ink font-medium">→ {l.currentQty + l.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="p-4 border-t border-n200 flex flex-col min-[600px]:flex-row min-[600px]:items-center min-[600px]:justify-between gap-3">
          {postError ? <p className="text-sm text-red">{postError}</p> : <span />}
          <Btn variant="pri" disabled={lines.length === 0 || posting} onClick={post} className="h-10">
            {posting ? "Posting…" : "Post purchase"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
