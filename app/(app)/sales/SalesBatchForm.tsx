"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import {
  getSalesContext,
  getSalesDraft,
  saveSalesDraft,
  clearSalesDraft,
  postSalesBatch,
  searchProductsForSale,
  type SalesContextProduct,
  type SalesProductResult,
  type SaleDraftLine,
} from "@/lib/sales/actions";

type BatchLine = SaleDraftLine;

export function SalesBatchForm({
  initialBusinessDay,
  departments,
  fixedDepartment,
}: {
  initialBusinessDay: string;
  departments: { id: string; name: string }[];
  fixedDepartment: { id: string; name: string } | null;
}) {
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const [departmentId, setDepartmentId] = useState(fixedDepartment?.id ?? "");
  const departmentName = fixedDepartment?.name ?? departments.find((d) => d.id === departmentId)?.name ?? "";

  const [contextProducts, setContextProducts] = useState<SalesContextProduct[]>([]);
  const [showUntouched, setShowUntouched] = useState(false);

  const [lines, setLines] = useState<BatchLine[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SalesProductResult[]>([]);
  const [picked, setPicked] = useState<SalesProductResult | null>(null);
  const [qty, setQty] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [insufficientStock, setInsufficientStock] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const searchToken = useRef(0);

  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ departmentName: string; businessDay: string; lineCount: number; totalBottles: number } | null>(
    null
  );

  // Reload context + restore any draft whenever department or business day
  // changes. Guarded by draftLoaded so the persist-effect below never fires
  // with an empty array before the restore attempt has actually resolved —
  // that would silently wipe a real draft on load.
  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    setRestoredNotice(false);
    setPicked(null);
    setSearch("");
    setResults([]);
    resetAddState();

    if (!departmentId) {
      setLines([]);
      setContextProducts([]);
      setDraftLoaded(true);
      return;
    }

    Promise.all([getSalesContext(departmentId, businessDay), getSalesDraft(departmentId, businessDay)]).then(
      ([context, draft]) => {
        if (cancelled) return;
        setContextProducts(context.products);
        if (draft && draft.length > 0) {
          setLines(draft);
          setRestoredNotice(true);
        } else {
          setLines([]);
        }
        setDraftLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, businessDay]);

  useEffect(() => {
    if (!draftLoaded || !departmentId) return;
    if (lines.length > 0) {
      saveSalesDraft(departmentId, businessDay, lines).catch(() => {});
    } else {
      clearSalesDraft(departmentId, businessDay).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, draftLoaded]);

  async function runSearch(q: string) {
    setSearch(q);
    setPicked(null);
    resetAddState();
    if (!q.trim() || !departmentId) {
      setResults([]);
      return;
    }
    const token = ++searchToken.current;
    const data = await searchProductsForSale(q, departmentId, businessDay);
    if (token === searchToken.current) setResults(data);
  }

  function resetAddState() {
    setAddError(null);
    setInsufficientStock(false);
    setOverrideReason("");
    setCorrectionMode(false);
    setCorrectionReason("");
  }

  function pick(product: SalesProductResult) {
    setPicked(product);
    setResults([]);
    setSearch(`${product.code} — ${product.name}`);
    setQty("");
    resetAddState();
  }

  function skipPicked() {
    setPicked(null);
    setSearch("");
    resetAddState();
  }

  function addToBatch() {
    if (!picked || !picked.assignedToDepartment) return;
    if (lines.some((l) => l.productId === picked.id)) {
      setAddError("Already in this batch — remove it below to change the figure.");
      return;
    }
    if (picked.existingSale && !correctionMode) return;
    if (correctionMode && !correctionReason.trim()) {
      setAddError("A reason is required to reverse the existing figure.");
      return;
    }

    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n) || n < 0) {
      setAddError("Enter zero or a positive whole number of bottles.");
      return;
    }

    const max = picked.openingQty + picked.receivedQty;
    const over = n > max;
    if (over && !overrideReason.trim()) {
      setInsufficientStock(true);
      setAddError(`Opening plus received for this product as at ${businessDay} is ${max} — ${n} requested.`);
      return;
    }

    setLines((prev) => [
      ...prev,
      {
        productId: picked.id,
        code: picked.code,
        name: picked.name,
        openingQty: picked.openingQty,
        receivedQty: picked.receivedQty,
        quantity: n,
        isOverride: over,
        overrideReason: over ? overrideReason.trim() : "",
        correctionOfMovementId: correctionMode ? picked.existingSale!.movementId : null,
        correctionReason: correctionMode ? correctionReason.trim() : "",
      },
    ]);
    setPicked(null);
    setSearch("");
    setQty("");
    resetAddState();
    setRestoredNotice(false);
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
    setRestoredNotice(false);
  }

  async function clearBatch() {
    setLines([]);
    setRestoredNotice(false);
    if (departmentId) await clearSalesDraft(departmentId, businessDay).catch(() => {});
  }

  async function post() {
    setPosting(true);
    setPostError(null);
    try {
      await postSalesBatch({
        businessDay,
        departmentId,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          isOverride: l.isOverride,
          overrideReason: l.overrideReason,
          correctionOfMovementId: l.correctionOfMovementId,
          correctionReason: l.correctionReason,
        })),
      });
      setPosted({
        departmentName,
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
    setBusinessDay(initialBusinessDay);
    if (!fixedDepartment) setDepartmentId("");
  }

  if (posted) {
    return (
      <Card title="Sales posted">
        <div className="p-6 text-sm leading-relaxed">
          <p className="mb-4">
            Recorded <b className="font-medium">{posted.lineCount}</b> line{posted.lineCount === 1 ? "" : "s"} totalling{" "}
            <b className="font-medium tabular-nums">{posted.totalBottles}</b> bottles sold at{" "}
            <b className="font-medium">{posted.departmentName}</b> for business day{" "}
            <b className="font-medium tabular-nums">{posted.businessDay}</b>.
          </p>
          <Btn variant="acc" onClick={startNewBatch}>
            Start a new batch
          </Btn>
        </div>
      </Card>
    );
  }

  const touchedIds = new Set(lines.map((l) => l.productId));
  const untouched = contextProducts.filter((p) => !touchedIds.has(p.id));
  const totalBottles = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Sales details">
        <div className="p-4 grid grid-cols-1 min-[600px]:grid-cols-2 gap-3.5">
          <Field label="Business day">
            <Input type="date" value={businessDay} onChange={(e) => setBusinessDay(e.target.value)} />
          </Field>
          <Field label="Department">
            {fixedDepartment ? (
              <Input value={fixedDepartment.name} disabled />
            ) : (
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full">
                <option value="">Select a department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {restoredNotice ? (
          <div className="px-4 pb-4 text-xs text-teal">
            An unposted draft for {departmentName} on {businessDay} was restored below.
          </div>
        ) : null}
      </Card>

      <Card title="Add sale">
        {!departmentId ? (
          <EmptyState title="Choose a department first" description="Pick the department this sale belongs to before searching products." />
        ) : (
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
                        {!r.assignedToDepartment ? <span className="text-xs text-amber flex-none">Not assigned</span> : null}
                        {r.assignedToDepartment && r.existingSale ? <span className="text-xs text-amber flex-none">Already posted</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>

            {picked && !picked.assignedToDepartment ? (
              <p className="text-sm text-n600">
                <b className="text-ink font-medium">{picked.name}</b> isn&apos;t assigned to this department — you can&apos;t record a
                sale for something it doesn&apos;t stock.
              </p>
            ) : null}

            {picked && picked.assignedToDepartment && lines.some((l) => l.productId === picked.id) ? (
              <p className="text-sm text-n600">
                <b className="text-ink font-medium">{picked.name}</b> is already in this batch — remove it in the table below to
                change its figure.
              </p>
            ) : null}

            {picked &&
            picked.assignedToDepartment &&
            !lines.some((l) => l.productId === picked.id) &&
            picked.existingSale &&
            !correctionMode ? (
              <div className="border border-[#F5CFA0] bg-[#FFFAEB] rounded p-3">
                <p className="text-sm text-amber mb-3">
                  <b className="font-medium tabular-nums">{picked.existingSale.quantity}</b> bottles already posted for this product
                  on {businessDay}.
                </p>
                <div className="flex gap-2">
                  <Btn type="button" onClick={skipPicked}>
                    Skip
                  </Btn>
                  <Btn type="button" variant="pri" onClick={() => setCorrectionMode(true)}>
                    Reverse &amp; correct
                  </Btn>
                </div>
              </div>
            ) : null}

            {picked && picked.assignedToDepartment && !lines.some((l) => l.productId === picked.id) && (!picked.existingSale || correctionMode) ? (
              <>
                <div className="text-xs text-n600 mb-3 mt-3">
                  Opening <b className="text-ink font-medium tabular-nums">{picked.openingQty}</b> · received{" "}
                  <b className="text-ink font-medium tabular-nums">{picked.receivedQty}</b>. Sales cannot exceed{" "}
                  {picked.openingQty + picked.receivedQty} without an override.
                </div>

                {correctionMode ? (
                  <Field label="Reason for reversing the existing figure (required)">
                    <Input
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="e.g. stock received but never entered, corrected after review"
                      autoFocus
                    />
                  </Field>
                ) : null}

                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Bottles sold">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="w-28"
                      value={qty}
                      onChange={(e) => {
                        setQty(e.target.value);
                        setAddError(null);
                        setInsufficientStock(false);
                      }}
                      placeholder="0"
                    />
                  </Field>
                  <Btn type="button" variant="acc" onClick={addToBatch} className="h-9">
                    Add to batch
                  </Btn>
                </div>

                {insufficientStock ? (
                  <div className="mt-3 border border-[#F5CFA0] bg-[#FFFAEB] rounded p-3">
                    <p className="text-sm text-amber mb-2">Not enough stock to cover this without an override.</p>
                    <Field label="Override reason (required to proceed anyway)">
                      <Input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="e.g. physical stock confirmed, ledger not yet updated"
                      />
                    </Field>
                    <Btn type="button" variant="pri" onClick={addToBatch} disabled={!overrideReason.trim()}>
                      Add anyway (flags for auditor review)
                    </Btn>
                  </div>
                ) : null}
              </>
            ) : null}

            {addError && !insufficientStock ? <p className="text-sm text-red mt-3">{addError}</p> : null}
          </div>
        )}
      </Card>

      <Card
        title="Batch"
        extra={`${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalBottles} bottles`}
      >
        {lines.length === 0 ? (
          <EmptyState title="No lines yet" description="Search a product above and add it to this batch to get started." />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Product", "Code", "Opening", "Received", "Sales", "Expected closing", "", ""].map((h, i) => (
                      <th
                        key={h + i}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i > 1 && i < 6 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const closing = l.openingQty + l.receivedQty - l.quantity;
                    return (
                      <tr key={l.productId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                        <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{l.name}</td>
                        <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{l.code}</td>
                        <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{l.openingQty}</td>
                        <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{l.receivedQty}</td>
                        <td className="px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap">{l.quantity}</td>
                        <td
                          className={`px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap ${closing < 0 ? "text-red" : ""}`}
                        >
                          {closing}
                        </td>
                        <td className="px-4 h-9 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            {l.isOverride ? <Tag variant="warn">Override</Tag> : null}
                            {l.correctionOfMovementId ? <Tag variant="mut">Correction</Tag> : null}
                          </div>
                        </td>
                        <td className="px-4 h-9 text-right whitespace-nowrap">
                          <button type="button" onClick={() => removeLine(l.productId)} className="text-teal text-sm">
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {lines.map((l) => {
                const closing = l.openingQty + l.receivedQty - l.quantity;
                return (
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-n600 tabular-nums items-center">
                      <span>Opening {l.openingQty}</span>
                      <span>Received {l.receivedQty}</span>
                      <span className="text-ink font-medium">Sold {l.quantity}</span>
                      <span className={`font-medium ${closing < 0 ? "text-red" : "text-ink"}`}>→ {closing}</span>
                      {l.isOverride ? <Tag variant="warn">Override</Tag> : null}
                      {l.correctionOfMovementId ? <Tag variant="mut">Correction</Tag> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="p-4 border-t border-n200">
          {departmentId && contextProducts.length > 0 ? (
            <div className="text-xs text-n600 mb-3">
              <button type="button" onClick={() => setShowUntouched((v) => !v)} className="text-teal">
                {lines.length}
              </button>{" "}
              product{lines.length === 1 ? "" : "s"} in this batch · the other{" "}
              <button type="button" onClick={() => setShowUntouched((v) => !v)} className="text-teal font-medium">
                {untouched.length}
              </button>{" "}
              product{untouched.length === 1 ? "" : "s"} in {departmentName} will be posted as zero sales for {businessDay}.
              {showUntouched && untouched.length > 0 ? (
                <div className="mt-2 border border-n200 rounded max-h-48 overflow-y-auto bg-n50">
                  {untouched.map((p) => (
                    <div key={p.id} className="px-3 py-1.5 text-xs border-b border-n200 last:border-b-0 flex gap-2">
                      <span className="text-n600 tabular-nums flex-none">{p.code}</span>
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col min-[600px]:flex-row min-[600px]:items-center min-[600px]:justify-between gap-3">
            <div className="flex gap-2">
              <Btn type="button" onClick={clearBatch} disabled={lines.length === 0}>
                Clear batch
              </Btn>
            </div>
            <div className="flex flex-col min-[600px]:flex-row min-[600px]:items-center gap-2">
              {postError ? <p className="text-sm text-red">{postError}</p> : null}
              <Btn variant="pri" disabled={lines.length === 0 || posting} onClick={post} className="h-10">
                {posting ? "Posting…" : "Post sales"}
              </Btn>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
