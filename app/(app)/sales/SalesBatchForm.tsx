"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, History, Minus, Plus, Search, ShoppingBag, Store, X } from "lucide-react";
import { Btn } from "@/components/ui/Button";
import { LoadingBlock, Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Tag } from "@/components/ui/Tag";
import { formatWeekdayDate } from "@/lib/dates";
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
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";

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

  const {
    query: search,
    results,
    searching,
    handleChange: debouncedSearch,
    setDisplayText,
    setResults,
    reset: resetSearch,
  } = useDebouncedSearch((q: string) => searchProductsForSale(q, departmentId, businessDay));
  const [picked, setPicked] = useState<SalesProductResult | null>(null);
  const [qty, setQty] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [insufficientStock, setInsufficientStock] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");

  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ departmentName: string; businessDay: string; lineCount: number; totalQty: number } | null>(
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
    resetSearch();
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

  // The search box only ever renders once departmentId is chosen (see the
  // EmptyState guard in the JSX below), so no further guard is needed here.
  function runSearch(q: string) {
    setPicked(null);
    resetAddState();
    debouncedSearch(q);
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
    setDisplayText(`${product.code} — ${product.name}`);
    setQty("");
    resetAddState();
  }

  function skipPicked() {
    setPicked(null);
    resetSearch();
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
      setAddError("Enter zero or a positive whole number.");
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
    resetSearch();
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
        totalQty: lines.reduce((sum, l) => sum + l.quantity, 0),
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
      <div className="surface-hero rounded-premium px-6 py-10 min-[900px]:py-14 text-center animate-rise">
        <div className="mx-auto w-16 h-16 rounded-full grid place-items-center bg-brand-bright text-frame shadow-glow-lg animate-check-pop">
          <Check size={30} strokeWidth={2.4} />
        </div>
        <h2 className="mt-5 text-[24px] font-medium tracking-[-0.025em] animate-rise [animation-delay:120ms]">Sales posted</h2>
        <p className="mt-2 text-[13px] text-on-dark-2 animate-rise [animation-delay:180ms]">
          {posted.departmentName} · business day {formatWeekdayDate(posted.businessDay)}
        </p>
        <div className="mt-6 inline-grid grid-cols-2 divide-x divide-white/10 rounded-[16px] bg-white/[0.06] ring-1 ring-inset ring-white/10 animate-rise [animation-delay:240ms]">
          <HeroStat label="Lines" value={posted.lineCount} />
          <HeroStat label="Quantity sold" value={posted.totalQty} />
        </div>
        <div className="mt-7 animate-rise [animation-delay:300ms]">
          <button
            type="button"
            onClick={startNewBatch}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-brand-bright text-frame text-[13px] font-medium transition-transform duration-200 hover:brightness-105 active:scale-[0.97]"
          >
            <Plus size={16} strokeWidth={2.2} />
            Start a new batch
          </button>
        </div>
      </div>
    );
  }

  const touchedIds = new Set(lines.map((l) => l.productId));
  const untouched = contextProducts.filter((p) => !touchedIds.has(p.id));
  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);
  const pickedInBatch = picked ? lines.some((l) => l.productId === picked.id) : false;
  const canEnterQty = !!picked && picked.assignedToDepartment && !pickedInBatch && (!picked.existingSale || correctionMode);
  const available = picked ? picked.openingQty + picked.receivedQty : 0;
  const qtyNum = qty.trim() === "" ? null : Number(qty);
  const closingPreview = qtyNum != null && Number.isFinite(qtyNum) ? available - qtyNum : null;

  function stepQty(delta: number) {
    const current = qtyNum != null && Number.isFinite(qtyNum) ? qtyNum : 0;
    setQty(String(Math.max(0, Math.trunc(current) + delta)));
    setAddError(null);
    setInsufficientStock(false);
  }

  const glassField =
    "w-full h-11 rounded-[12px] bg-white/[0.06] border border-white/10 px-3.5 text-[13px] text-on-dark outline-none transition-colors focus:border-brand-bright/60 focus:bg-white/[0.09] [color-scheme:dark]";

  return (
    <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_380px] gap-3 items-start">
      <div className="grid grid-cols-1 gap-3 min-w-0">
        {/* Session hero — department, business day and running totals. */}
        <section className="surface-hero rounded-premium p-5 min-[900px]:p-6 animate-rise">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11.5px] text-on-dark-mut">Recording sales for</p>
              <h2 className="mt-1 text-[22px] min-[900px]:text-[26px] font-medium tracking-[-0.03em] leading-tight truncate">
                {departmentName || "Choose a department"}
              </h2>
              <p className="mt-1 text-[12px] text-on-dark-mut">Business day {formatWeekdayDate(businessDay)}</p>
            </div>
            {restoredNotice ? (
              <span className="flex-none inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-brand-bright/15 text-brand-bright ring-1 ring-inset ring-brand-bright/25 animate-pop">
                <History size={12} strokeWidth={2} />
                Draft restored
              </span>
            ) : lines.length > 0 ? (
              <span className="flex-none inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] text-on-dark-2 ring-1 ring-inset ring-white/10">
                <i className="w-1.5 h-1.5 rounded-full bg-brand-bright" />
                Draft autosaved
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid grid-cols-1 min-[600px]:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-on-dark-mut mb-1.5">Business day</span>
              <input type="date" value={businessDay} onChange={(e) => setBusinessDay(e.target.value)} className={glassField} />
            </label>
            <label className="block">
              <span className="block text-[11px] text-on-dark-mut mb-1.5">Department</span>
              {fixedDepartment ? (
                <div className={`${glassField} flex items-center text-on-dark-2`}>{fixedDepartment.name}</div>
              ) : (
                <div className="relative">
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className={`${glassField} appearance-none pr-9 cursor-pointer`}
                  >
                    <option value="">Select a department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} strokeWidth={1.75} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-dark-mut pointer-events-none" />
                </div>
              )}
            </label>
          </div>

          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-[16px] bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
            <HeroStat label="Products" value={departmentId ? (draftLoaded ? contextProducts.length : null) : "—"} />
            <HeroStat label="In batch" value={lines.length} />
            <HeroStat label="Quantity" value={totalQty} />
          </div>
        </section>

        {/* Add a sale */}
        <section className="bg-white rounded-premium shadow-premium p-5 min-[900px]:p-6 animate-rise [animation-delay:60ms]">
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[15px] font-medium tracking-[-0.01em]">Add a sale</h2>
              <p className="text-[11.5px] text-n600 mt-0.5">Find a product, enter the quantity sold, add it to the batch.</p>
            </div>
          </div>

          {!departmentId ? (
            <div className="flex flex-col items-center text-center py-10">
              <span className="w-12 h-12 rounded-full grid place-items-center bg-brand-soft text-brand">
                <Store size={20} strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[13px] font-medium">Choose a department first</p>
              <p className="mt-1 text-[12px] text-n600">Pick the department above, then search its products here.</p>
            </div>
          ) : !draftLoaded ? (
            <LoadingBlock label="Loading products…" />
          ) : (
            <>
              <div className="relative">
                <Search size={17} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-n400 pointer-events-none" />
                <input
                  placeholder="Search by product code or name"
                  value={search}
                  onChange={(e) => runSearch(e.target.value)}
                  className={`w-full h-12 rounded-[14px] bg-n50 border border-transparent pl-11 ${searching ? "pr-32" : "pr-4"} text-[13.5px] text-ink placeholder:text-n400 outline-none transition-[background-color,border-color,box-shadow] duration-200 focus:bg-white focus:border-brand-bright/50 focus:shadow-focus`}
                />
                {searching ? (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11.5px] text-n600" role="status">
                    <Spinner size={16} />
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
                        {!r.assignedToDepartment ? <Tag variant="warn">Not assigned</Tag> : null}
                        {r.assignedToDepartment && r.existingSale ? <Tag variant="warn">Already posted</Tag> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {picked ? (
                <div key={picked.id} className="mt-4 rounded-[16px] ring-1 ring-n200 p-4 min-[900px]:p-5 animate-rise">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium tracking-[-0.01em] truncate">{picked.name}</p>
                      <p className="text-[11.5px] text-n600 tabular-nums mt-0.5">{picked.code}</p>
                    </div>
                    <button
                      type="button"
                      onClick={skipPicked}
                      aria-label="Clear selection"
                      className="w-8 h-8 rounded-full grid place-items-center text-n600 transition-colors hover:bg-brand-hover hover:text-ink"
                    >
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  </div>

                  {!picked.assignedToDepartment ? (
                    <p className="mt-3 text-[12.5px] text-n600">
                      This product isn&apos;t assigned to {departmentName} — you can&apos;t record a sale for something it doesn&apos;t stock.
                    </p>
                  ) : null}

                  {picked.assignedToDepartment && pickedInBatch ? (
                    <p className="mt-3 text-[12.5px] text-n600">Already in this batch — remove it from the batch to change its figure.</p>
                  ) : null}

                  {picked.assignedToDepartment && !pickedInBatch && picked.existingSale && !correctionMode ? (
                    <div className="mt-4 rounded-[12px] bg-amber-soft p-4 animate-rise">
                      <p className="text-[12.5px] text-amber">
                        <b className="font-medium tabular-nums">{picked.existingSale.quantity}</b> already posted for this product
                        on {formatWeekdayDate(businessDay)}.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Btn type="button" onClick={skipPicked}>
                          Skip
                        </Btn>
                        <Btn type="button" variant="pri" onClick={() => setCorrectionMode(true)}>
                          Reverse &amp; correct
                        </Btn>
                      </div>
                    </div>
                  ) : null}

                  {canEnterQty ? (
                    <>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <Metric label="Opening" value={picked.openingQty} />
                        <Metric label="Received" value={picked.receivedQty} />
                        <Metric label="Available" value={available} strong />
                      </div>

                      {correctionMode ? (
                        <label className="block mt-4 animate-rise">
                          <span className="block text-[11.5px] text-n600 mb-1.5">Reason for reversing the existing figure (required)</span>
                          <Input
                            value={correctionReason}
                            onChange={(e) => setCorrectionReason(e.target.value)}
                            placeholder="e.g. stock received but never entered, corrected after review"
                            autoFocus
                          />
                        </label>
                      ) : null}

                      <div className="mt-5 flex flex-col min-[600px]:flex-row min-[600px]:items-end gap-4">
                        <div>
                          <span className="block text-[11.5px] text-n600 mb-1.5">Quantity sold</span>
                          <div className="inline-flex items-center gap-2 rounded-full bg-n50 p-1.5">
                            <StepButton label="One fewer" onClick={() => stepQty(-1)}>
                              <Minus size={16} strokeWidth={2} />
                            </StepButton>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={qty}
                              placeholder="0"
                              aria-label="Quantity sold"
                              onChange={(e) => {
                                setQty(e.target.value);
                                setAddError(null);
                                setInsufficientStock(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addToBatch();
                              }}
                              className="w-20 bg-transparent text-center text-[26px] font-medium tracking-[-0.02em] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <StepButton label="One more" onClick={() => stepQty(1)}>
                              <Plus size={16} strokeWidth={2} />
                            </StepButton>
                          </div>
                        </div>
                        <div className="flex-1 min-[600px]:pb-2.5 text-[12px] text-n600">
                          {closingPreview != null ? (
                            <span>
                              Closing after this sale{" "}
                              <b className={`font-medium tabular-nums ${closingPreview < 0 ? "text-red" : "text-ink"}`}>{closingPreview}</b>
                            </span>
                          ) : (
                            <span>Up to {available} without an override.</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={addToBatch}
                          className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[14px] bg-ink text-white text-[13px] font-medium shadow-btn transition-[transform,background-color] duration-200 hover:bg-frame active:scale-[0.97]"
                        >
                          <Plus size={16} strokeWidth={2.2} className="text-brand-bright" />
                          Add to batch
                        </button>
                      </div>

                      {insufficientStock ? (
                        <div className="mt-4 rounded-[12px] bg-amber-soft p-4 animate-rise">
                          <p className="text-[12.5px] text-amber mb-3">
                            Only {available} available as at {formatWeekdayDate(businessDay)} — {qty} entered. Add an override reason to
                            record it anyway; it will be flagged for the auditor.
                          </p>
                          <Input
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="e.g. physical stock confirmed, ledger not yet updated"
                          />
                          <Btn type="button" variant="pri" onClick={addToBatch} disabled={!overrideReason.trim()} className="mt-3">
                            Add anyway
                          </Btn>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {addError && !insufficientStock ? <p className="text-[12.5px] text-red mt-3 animate-pop">{addError}</p> : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {/* Batch — the running receipt, sticky beside the form on wide screens. */}
      <aside className="surface-dark rounded-premium min-[1100px]:sticky min-[1100px]:top-4 animate-rise [animation-delay:120ms] overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">Batch</h2>
            <p className="text-[11.5px] text-on-dark-mut mt-0.5 truncate">
              {departmentName ? `${departmentName} · ${formatWeekdayDate(businessDay)}` : "Nothing selected yet"}
            </p>
          </div>
          <span className="flex-none text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10 text-on-dark-2 tabular-nums">
            {lines.length} line{lines.length === 1 ? "" : "s"}
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="px-5 pb-6 pt-4 flex flex-col items-center text-center">
            <span className="w-12 h-12 rounded-full grid place-items-center bg-white/[0.06] ring-1 ring-inset ring-white/10 text-on-dark-mut">
              <ShoppingBag size={20} strokeWidth={1.6} />
            </span>
            <p className="mt-3 text-[13px] font-medium">No lines yet</p>
            <p className="mt-1 text-[12px] text-on-dark-mut">Products you add appear here before you post.</p>
          </div>
        ) : (
          <ul className="px-3 max-h-[46vh] overflow-y-auto">
            {lines.map((l) => {
              const closing = l.openingQty + l.receivedQty - l.quantity;
              return (
                <li key={l.productId} className="group flex items-center gap-3 px-2 py-2.5 rounded-[12px] transition-colors hover:bg-white/[0.05] animate-rise">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium truncate">{l.name}</p>
                    <p className="text-[11px] text-on-dark-mut tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {l.code} · {l.openingQty + l.receivedQty} → <span className={closing < 0 ? "text-red-on-dark" : "text-on-dark-2"}>{closing}</span>
                      {l.isOverride ? <DarkTag>Override</DarkTag> : null}
                      {l.correctionOfMovementId ? <DarkTag>Correction</DarkTag> : null}
                    </p>
                  </div>
                  <span className="text-[17px] font-medium tabular-nums tracking-[-0.02em]">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.productId)}
                    aria-label={`Remove ${l.name}`}
                    className="w-7 h-7 rounded-full grid place-items-center text-on-dark-mut transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-5 pt-3 pb-5 mt-1 border-t border-white/[0.07]">
          {departmentId && contextProducts.length > 0 ? (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowUntouched((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-left text-[11.5px] text-on-dark-mut hover:text-on-dark-2 transition-colors"
              >
                <span>
                  The other <b className="font-medium text-on-dark tabular-nums">{untouched.length}</b> product{untouched.length === 1 ? "" : "s"} will
                  post as zero sales
                </span>
                <ChevronDown size={14} strokeWidth={1.75} className={`flex-none transition-transform duration-300 ${showUntouched ? "rotate-180" : ""}`} />
              </button>
              {showUntouched && untouched.length > 0 ? (
                <div className="mt-2 rounded-[12px] bg-white/[0.04] ring-1 ring-inset ring-white/[0.07] max-h-48 overflow-y-auto animate-pop">
                  {untouched.map((p) => (
                    <div key={p.id} className="px-3 py-1.5 text-[11.5px] border-b border-white/[0.05] last:border-b-0 flex gap-2">
                      <span className="text-on-dark-mut tabular-nums flex-none">{p.code}</span>
                      <span className="truncate text-on-dark-2">{p.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-end justify-between mb-4">
            <span className="text-[11.5px] text-on-dark-mut">Total quantity sold</span>
            <span className="text-[28px] font-medium tracking-[-0.03em] tabular-nums leading-none">{totalQty}</span>
          </div>

          {postError ? <p className="text-[12px] text-red-on-dark mb-3 animate-pop">{postError}</p> : null}

          <button
            type="button"
            onClick={post}
            disabled={lines.length === 0 || posting}
            className={`w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,background-color,box-shadow,filter] duration-200 active:scale-[0.98] ${
              posting
                ? "bg-frame-3 text-on-dark ring-1 ring-inset ring-white/10"
                : lines.length === 0
                  ? "bg-white/[0.06] text-on-dark-mut cursor-not-allowed"
                  : "bg-brand-bright text-frame hover:brightness-105 shadow-glow"
            }`}
          >
            {posting ? <Spinner size={16} /> : <Check size={16} strokeWidth={2.4} />}
            {posting ? "Posting…" : lines.length > 0 ? `Post ${lines.length} sale${lines.length === 1 ? "" : "s"}` : "Post sales"}
          </button>
          <button
            type="button"
            onClick={clearBatch}
            disabled={lines.length === 0 || posting}
            className="mt-2 w-full h-9 rounded-[12px] text-[12px] text-on-dark-mut transition-colors hover:text-on-dark hover:bg-white/[0.05] disabled:opacity-40 disabled:pointer-events-none"
          >
            Clear batch
          </button>
        </div>
      </aside>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="px-4 py-3 min-w-0">
      <span className="block text-[11px] text-on-dark-mut">{label}</span>
      <span className="block mt-0.5 text-[20px] font-medium tracking-[-0.02em] tabular-nums h-7 flex items-center">
        {value == null ? <Spinner size={16} /> : value}
      </span>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-[12px] px-3 py-2.5 ${strong ? "bg-brand-soft" : "bg-n50"}`}>
      <span className={`block text-[11px] ${strong ? "text-brand" : "text-n600"}`}>{label}</span>
      <span className={`block text-[18px] font-medium tracking-[-0.02em] tabular-nums ${strong ? "text-brand" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="w-10 h-10 rounded-full grid place-items-center bg-white text-ink shadow-premium transition-[transform,background-color] duration-150 hover:bg-brand-hover active:scale-90"
    >
      {children}
    </button>
  );
}

function DarkTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block text-[10px] px-1.5 py-px rounded-sm bg-amber-soft/15 text-amber-soft ring-1 ring-inset ring-amber-soft/20">{children}</span>;
}
