"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { Input } from "@/components/ui/Input";
import { formatNaira } from "@/lib/format";
import { correctCountEntry, type CompareLine, type CompareSummary, type SessionMeta } from "@/lib/counts/actions";

type SortKey = "shelf" | "value" | "quantity";

function computeFlag(variance: number): CompareLine["flag"] {
  return variance < 0 ? "short" : variance > 0 ? "excess" : "tally";
}

function recomputeLine(l: CompareLine, newQty: number): CompareLine {
  const variance = newQty - l.expectedQty;
  const bookDiffers = l.ledgerQty != null && l.ledgerQty !== l.expectedQty;
  return {
    ...l,
    countedQty: newQty,
    variance,
    value: variance !== 0 ? Math.abs(variance) * l.unitCost : 0,
    flag: computeFlag(variance),
    bookDiffers,
  };
}

function recomputeSummary(lines: CompareLine[]): CompareSummary {
  const mismatches = lines.filter((l) => l.flag !== "tally" || l.bookDiffers);
  return {
    productsCounted: lines.length,
    tallyCount: lines.length - mismatches.length,
    varianceCount: mismatches.length,
    netVarianceValue: lines.reduce((sum, l) => sum + l.variance * l.unitCost, 0),
  };
}

export function CompareTable({
  session,
  initialLines,
  initialSummary,
}: {
  session: SessionMeta;
  initialLines: CompareLine[];
  initialSummary: CompareSummary;
}) {
  const [lines, setLines] = useState(initialLines);
  const [summary, setSummary] = useState(initialSummary);
  const [showAll, setShowAll] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("shelf");
  const [editing, setEditing] = useState<CompareLine | null>(null);

  const visibleLines = useMemo(() => {
    const base = showAll ? lines : lines.filter((l) => l.flag !== "tally" || l.bookDiffers);
    const sorted = [...base];
    if (sortKey === "value") sorted.sort((a, b) => b.value - a.value);
    else if (sortKey === "quantity") sorted.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    else sorted.sort((a, b) => (a.shelfOrder ?? Infinity) - (b.shelfOrder ?? Infinity));
    return sorted;
  }, [lines, showAll, sortKey]);

  const netSign = summary.netVarianceValue < 0 ? "−" : summary.netVarianceValue > 0 ? "+" : "";
  const netColor = summary.netVarianceValue < 0 ? "text-red" : summary.netVarianceValue > 0 ? "text-green" : undefined;
  const exportHref = `/compare/${session.id}/export${showAll ? "?all=1" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Stat label="Products counted" value={String(summary.productsCounted)} />
        <Stat label="Tally" value={String(summary.tallyCount)} colorClassName="text-green" />
        <Stat label="Variances" value={String(summary.varianceCount)} colorClassName={summary.varianceCount > 0 ? "text-red" : undefined} />
        <Stat label="Net value" value={`${netSign}${formatNaira(summary.netVarianceValue)}`} colorClassName={netColor} />
      </div>

      <Card title={`Variances — ${session.departmentName}`} extra={showAll ? "Showing every product" : "Only products that don't tally are listed"}>
        <div className="px-4 py-2.5 border-b border-n200 flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs text-n600 flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" className="accent-teal w-4 h-4" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all products
          </label>
          <label className="text-xs text-n600 flex items-center gap-1.5">
            Sort by
            <select
              className="border border-n200 rounded px-2 py-1 text-xs bg-white"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="shelf">Shelf order</option>
              <option value="value">Value</option>
              <option value="quantity">Quantity</option>
            </select>
          </label>
        </div>

        {visibleLines.length === 0 ? (
          <div className="p-8 text-center text-sm text-n600">Every product tallies. Nothing to review.</div>
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Product", "Expected", "Counted", "Ledger", "Variance", "Value", "Flag", ""].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i > 0 && i < 6 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map((l) => (
                    <tr key={l.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        {l.name} <span className="text-n600 text-xs">{l.code}</span>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.expectedQty}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.countedQty}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.ledgerQty ?? "—"}</td>
                      <td
                        className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                          l.variance < 0 ? "text-red font-medium" : l.variance > 0 ? "text-green font-medium" : ""
                        }`}
                      >
                        {l.variance > 0 ? `+${l.variance}` : l.variance}
                      </td>
                      <td
                        className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                          l.variance < 0 ? "text-red font-medium" : l.variance > 0 ? "text-green font-medium" : ""
                        }`}
                      >
                        {l.variance === 0 ? "—" : formatNaira(l.value)}
                      </td>
                      <td className="px-4 h-9 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {l.flag === "short" ? <Tag variant="bad">Short</Tag> : null}
                          {l.flag === "excess" ? <Tag variant="ok">Excess</Tag> : null}
                          {l.bookDiffers ? <Tag variant="warn">Book differs</Tag> : null}
                          {l.flag === "tally" && !l.bookDiffers ? <Tag variant="mut">Tally</Tag> : null}
                        </div>
                      </td>
                      <td className="px-4 h-9 text-right whitespace-nowrap">
                        {session.status !== "LOCKED" ? (
                          <button type="button" onClick={() => setEditing(l)} className="text-teal text-sm">
                            Correct
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {visibleLines.map((l) => (
                <div key={l.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{l.name}</div>
                      <div className="text-xs text-n600 tabular-nums mt-0.5">{l.code}</div>
                    </div>
                    {session.status !== "LOCKED" ? (
                      <button type="button" onClick={() => setEditing(l)} className="text-teal text-sm flex-none">
                        Correct
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-n600 tabular-nums items-center">
                    <span>Expected {l.expectedQty}</span>
                    <span>Counted {l.countedQty}</span>
                    <span>Ledger {l.ledgerQty ?? "—"}</span>
                    <span className={l.variance < 0 ? "text-red font-medium" : l.variance > 0 ? "text-green font-medium" : "text-ink"}>
                      Variance {l.variance > 0 ? `+${l.variance}` : l.variance}
                    </span>
                    {l.variance !== 0 ? <span className="text-ink font-medium">{formatNaira(l.value)}</span> : null}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {l.flag === "short" ? <Tag variant="bad">Short</Tag> : null}
                    {l.flag === "excess" ? <Tag variant="ok">Excess</Tag> : null}
                    {l.bookDiffers ? <Tag variant="warn">Book differs</Tag> : null}
                    {l.flag === "tally" && !l.bookDiffers ? <Tag variant="mut">Tally</Tag> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="p-4 border-t border-n200 flex items-center justify-between gap-3">
          <span className="text-sm text-n600">
            {session.status === "LOCKED" ? "This session is locked — read-only." : "Nothing is locked at this stage."}
          </span>
          <Link href={exportHref}>
            <Btn>Export CSV</Btn>
          </Link>
        </div>
      </Card>

      {editing ? (
        <CorrectDialog
          line={editing}
          onClose={() => setEditing(null)}
          onSaved={(newQty) => {
            setLines((prev) => {
              const next = prev.map((l) => (l.id === editing.id ? recomputeLine(l, newQty) : l));
              setSummary(recomputeSummary(next));
              return next;
            });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CorrectDialog({
  line,
  onClose,
  onSaved,
}: {
  line: CompareLine;
  onClose: () => void;
  onSaved: (newQty: number) => void;
}) {
  const [qty, setQty] = useState(String(line.countedQty));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n) || n < 0) {
      setError("Enter zero or a positive whole number.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required to correct a count entry.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await correctCountEntry(line.id, n, reason.trim());
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this correction.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={pending ? undefined : onClose} />
      <div className="relative bg-white border border-n200 rounded max-w-[440px] w-full" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-n200">
          <h2 className="text-sm font-medium">Correct {line.name}</h2>
          <p className="text-xs text-n600 mt-1">
            {line.code} · currently counted <span className="tabular-nums">{line.countedQty}</span>
          </p>
        </div>
        <div className="p-4">
          <label className="block text-xs text-n600 mb-1.5">Corrected quantity</label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="mb-3.5"
          />
          <label className="block text-xs text-n600 mb-1.5">Reason (required — recorded as an adjustment)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. corrected a typo, re-checked the shelf" />
          {error ? <p className="text-sm text-red mt-3">{error}</p> : null}
        </div>
        <div className="p-4 border-t border-n200 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Btn>
          <Btn type="button" variant="acc" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save correction"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
