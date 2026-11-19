"use client";

import { useEffect, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { ArrowRight, Check, ChevronDown, Minus, PackageMinus, PackagePlus, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import {
  postStockAdjustment,
  searchProductsForAdjustment,
  type AdjustmentDepartment,
  type AdjustmentProductResult,
} from "@/lib/adjustments/actions";
import { ADJUSTMENT_CATEGORIES } from "@/lib/movements/labels";
import { useDebouncedSearch } from "@/lib/useDebouncedSearch";
import { formatNaira } from "@/lib/format";
import { formatWeekdayDate } from "@/lib/dates";

type Direction = "remove" | "add";

export function AdjustmentForm({ departments, initialBusinessDay }: { departments: AdjustmentDepartment[]; initialBusinessDay: string }) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState("");
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const [picked, setPicked] = useState<AdjustmentProductResult | null>(null);
  const [direction, setDirection] = useState<Direction>("remove");
  const [qty, setQty] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const { query, results, searching, handleChange, setDisplayText, setResults, reset } = useDebouncedSearch((q: string) =>
    searchProductsForAdjustment(departmentId, q, businessDay)
  );

  // A different department or day changes the balance — start the pick over.
  useEffect(() => {
    setPicked(null);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, businessDay]);

  const categories = ADJUSTMENT_CATEGORIES.filter((c) => c.direction === "both" || c.direction === direction);
  const n = Number(qty);
  const validQty = Number.isInteger(n) && n > 0;
  const after = picked && validQty ? picked.closingQty + (direction === "add" ? n : -n) : null;
  const tooMany = after !== null && after < 0;

  function pick(p: AdjustmentProductResult) {
    setPicked(p);
    setResults([]);
    setDisplayText(`${p.code} — ${p.name}`);
    setQty("");
    setError(null);
    setDone(null);
  }

  function step(delta: number) {
    const cur = validQty ? n : 0;
    setQty(String(Math.max(0, cur + delta)));
  }

  async function submit() {
    if (!picked) return setError("Choose a product.");
    if (!validQty) return setError("Enter how many to " + (direction === "add" ? "add." : "remove."));
    if (tooMany) return setError(`Only ${picked.closingQty} in stock — you can't remove ${n}.`);
    if (!category) return setError("Choose a reason.");
    if (!note.trim()) return setError("Add a short note explaining the adjustment.");
    setSaving(true);
    setError(null);
    try {
      await postStockAdjustment({ departmentId, businessDay, productId: picked.id, direction, quantity: n, category, note });
      setDone(
        `${direction === "add" ? "Added" : "Removed"} ${n} ${picked.name} ${direction === "add" ? "to" : "from"} ${
          departments.find((d) => d.id === departmentId)?.name ?? "the department"
        }.`
      );
      setPicked(null);
      reset();
      setQty("");
      setCategory("");
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record this adjustment.");
    } finally {
      setSaving(false);
    }
  }

  const glass =
    "w-full h-11 rounded-[12px] bg-white/[0.06] border border-white/10 px-3.5 text-[13px] text-on-dark outline-none focus:border-brand-bright/60 [color-scheme:dark]";

  return (
    <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
      <div className="grid grid-cols-1 gap-3 min-w-0">
        <section className="surface-hero rounded-premium p-5 min-[900px]:p-6 animate-rise">
          <p className="text-[11.5px] text-on-dark-mut">Stock adjustment</p>
          <h2 className="mt-1 text-[22px] font-medium tracking-[-0.03em]">
            {departments.find((d) => d.id === departmentId)?.name ?? "Choose a department"}
          </h2>
          <div className="mt-4 grid grid-cols-1 min-[600px]:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] text-on-dark-mut mb-1.5">Department</span>
              <div className="relative">
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={`${glass} appearance-none pr-9 cursor-pointer`}>
                  <option value="">Select a department…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.isCentralStore ? " (central store)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} strokeWidth={1.75} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-dark-mut pointer-events-none" />
              </div>
            </label>
            <label className="block">
              <span className="block text-[11px] text-on-dark-mut mb-1.5">Business day</span>
              <input type="date" value={businessDay} onChange={(e) => setBusinessDay(e.target.value)} className={glass} />
            </label>
          </div>
        </section>

        <section className="bg-white rounded-premium shadow-premium p-5 min-[900px]:p-6 animate-rise [animation-delay:60ms]">
          <h2 className="text-[15px] font-medium tracking-[-0.01em]">Product</h2>
          <p className="text-[11.5px] text-n600 mt-0.5 mb-4">Search the products this department stocks.</p>
          {!departmentId ? (
            <p className="text-[12.5px] text-n600 py-6 text-center">Choose a department first.</p>
          ) : (
            <div className="relative">
              <Search size={17} strokeWidth={1.75} className="absolute left-4 top-1/2 -translate-y-1/2 text-n400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => {
                  setPicked(null);
                  handleChange(e.target.value);
                }}
                placeholder="Search by product code or name"
                className={`w-full h-12 rounded-[14px] bg-n50 border border-transparent pl-11 ${searching ? "pr-32" : "pr-4"} text-[13.5px] outline-none transition-[background-color,border-color,box-shadow] duration-200 focus:bg-white focus:border-brand-bright/50 focus:shadow-focus`}
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
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] hover:bg-brand-hover"
                    >
                      <span className="flex-none text-[11px] tabular-nums text-n600 bg-n100 rounded-sm px-1.5 py-0.5">{r.code}</span>
                      <span className="truncate flex-1">{r.name}</span>
                      <span className="text-[11.5px] text-n600 tabular-nums">{r.closingQty} in stock</span>
                    </button>
                  ))}
                </div>
              ) : query.trim() && !searching && !picked ? (
                <p className="text-[12px] text-n600 mt-2">No product stocked by this department matches.</p>
              ) : null}
            </div>
          )}

          {picked ? (
            <div key={picked.id} className="mt-4 rounded-[16px] ring-1 ring-n200 p-4 min-[900px]:p-5 animate-rise">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium truncate">{picked.name}</p>
                  <p className="text-[11.5px] text-n600 mt-0.5 tabular-nums">
                    {picked.code} · {picked.closingQty} in stock as at {formatWeekdayDate(businessDay)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => {
                    setPicked(null);
                    reset();
                  }}
                  className="w-8 h-8 rounded-full grid place-items-center text-n600 hover:bg-brand-hover"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-4 inline-grid grid-cols-2 p-1 rounded-full bg-n100" role="radiogroup" aria-label="Direction">
                {(
                  [
                    ["remove", "Remove stock", PackageMinus],
                    ["add", "Add stock", PackagePlus],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={direction === key}
                    onClick={() => {
                      setDirection(key);
                      setCategory("");
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-[12.5px] transition-all duration-200 ${
                      direction === key ? "bg-ink text-white shadow-btn" : "text-n600 hover:text-ink"
                    }`}
                  >
                    <Icon size={15} strokeWidth={1.8} className={direction === key ? "text-brand-bright" : ""} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-end gap-5">
                <div>
                  <span className="block text-[11.5px] text-n600 mb-1.5">Quantity to {direction}</span>
                  <div className="inline-flex items-center gap-2 rounded-full bg-n50 p-1.5">
                    <StepButton label="One fewer" onClick={() => step(-1)}>
                      <Minus size={16} strokeWidth={2} />
                    </StepButton>
                    <input
                      inputMode="numeric"
                      value={qty}
                      onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      aria-label="Quantity"
                      className="w-20 bg-transparent text-center text-[26px] font-medium tracking-[-0.02em] tabular-nums outline-none"
                    />
                    <StepButton label="One more" onClick={() => step(1)}>
                      <Plus size={16} strokeWidth={2} />
                    </StepButton>
                  </div>
                </div>
                {after !== null ? (
                  <div className="pb-2.5 flex items-center gap-2 text-[13px] tabular-nums">
                    <span className="text-n600">{picked.closingQty}</span>
                    <ArrowRight size={15} strokeWidth={1.75} className="text-n400" />
                    <b className={`text-[20px] font-medium ${tooMany ? "text-red" : "text-ink"}`}>{after}</b>
                    <span className="text-[11.5px] text-n600">
                      ({direction === "add" ? "+" : "−"}
                      {formatNaira(n * picked.unitCost)} at cost)
                    </span>
                  </div>
                ) : null}
              </div>
              {tooMany ? <p className="text-[12px] text-red mt-2">Only {picked.closingQty} in stock — you can&apos;t remove more than that.</p> : null}

              <div className="mt-5">
                <span className="block text-[11.5px] text-n600 mb-2">Reason</span>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`h-9 px-3.5 rounded-full text-[12.5px] transition-all duration-200 active:scale-[0.97] ${
                        category === c.value ? "bg-brand text-white shadow-btn" : "bg-white ring-1 ring-inset ring-n200 text-ink hover:bg-brand-hover"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block mt-4">
                <span className="block text-[11.5px] text-n600 mb-1.5">Note (required)</span>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={direction === "remove" ? "e.g. 6 past expiry date 10 Nov, binned" : "e.g. carton found behind shelf during count"}
                />
              </label>
            </div>
          ) : null}
        </section>
      </div>

      <aside className="surface-dark rounded-premium p-5 min-[1100px]:sticky min-[1100px]:top-4 animate-rise [animation-delay:120ms]">
        <p className="text-[11.5px] text-on-dark-mut">Summary</p>
        {picked && validQty ? (
          <div className="mt-2">
            <p className="text-[14px]">
              {direction === "add" ? "Add" : "Remove"} <b className="font-medium tabular-nums">{n}</b> {picked.name}
            </p>
            <p className="text-[12px] text-on-dark-2 mt-1">
              {departments.find((d) => d.id === departmentId)?.name} · {formatWeekdayDate(businessDay)}
            </p>
            <p className="text-[12px] text-on-dark-mut mt-1">
              {ADJUSTMENT_CATEGORIES.find((c) => c.value === category)?.label ?? "No reason chosen yet"}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[12.5px] text-on-dark-2">Choose a department, a product and a quantity.</p>
        )}
        <p className="mt-4 text-[11.5px] text-on-dark-mut leading-relaxed">
          The adjustment shows in the stock ledger for that day, in Reports, and on its own receipt. It can be reversed later from Movements if
          it was a mistake.
        </p>
        {error ? <p className="mt-3 text-[12px] text-red-on-dark animate-pop">{error}</p> : null}
        {done ? (
          <p className="mt-3 text-[12px] text-brand-bright animate-pop inline-flex items-center gap-1.5">
            <Check size={14} strokeWidth={2.4} />
            {done}
          </p>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={saving || !picked}
          className={`mt-4 w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,filter,background-color] duration-200 active:scale-[0.98] ${
            saving
              ? "bg-frame-3 text-on-dark ring-1 ring-inset ring-white/10"
              : !picked
                ? "bg-white/[0.06] text-on-dark-mut cursor-not-allowed"
                : "bg-brand-bright text-frame hover:brightness-105 shadow-glow"
          }`}
        >
          {saving ? <Spinner size={16} /> : <Check size={16} strokeWidth={2.4} />}
          {saving ? "Recording…" : "Record adjustment"}
        </button>
      </aside>
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
