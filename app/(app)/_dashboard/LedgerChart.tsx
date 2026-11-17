"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatNaira } from "@/lib/format";
import type { LedgerRow } from "@/lib/dashboard/actions";

type Totals = { openingValue: number; receivedValue: number; issuedValue: number; closingValue: number; productCount: number };

const SERIES = [
  { key: "openingValue", label: "Opening", swatch: "bg-n200" },
  { key: "receivedValue", label: "Received", swatch: "bg-brand-bright" },
  { key: "issuedValue", label: "Issued", swatch: "bg-ink" },
  { key: "closingValue", label: "Closing", swatch: "bg-brand" },
] as const;

const TH = "text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap";
const TD = "px-4 h-9 text-[12.5px] tabular-nums whitespace-nowrap";

// Rounds the chart's top gridline up to 1/2/2.5/5 × 10ⁿ so the axis reads cleanly.
function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= v) ?? 10;
  return step * pow;
}

function compactNaira(v: number) {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `₦${+(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `₦${+(v / 1_000).toFixed(1)}k`;
  return `₦${v}`;
}

// The dashboard's Stock ledger card: the same per-department opening /
// received / issued / closing figures as before, shown as a grouped bar
// chart by default with a Chart/Table switch back to the full table.
export function LedgerChart({ rows, totals, extra }: { rows: LedgerRow[]; totals: Totals; extra: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<string | null>(null);

  const rawMax = Math.max(0, ...rows.flatMap((r) => [r.openingValue, r.receivedValue, r.issuedValue, r.closingValue]));
  const max = niceMax(rawMax);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => max * f);

  const toggle = (
    <div className="inline-flex items-center gap-0.5 p-[3px] rounded bg-ink text-[11.5px]" role="tablist" aria-label="Ledger view">
      {(
        [
          ["chart", "Chart", BarChart3],
          ["table", "Table", Table2],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={view === key}
          onClick={() => setView(key)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] ${view === key ? "bg-frame-3 text-white" : "text-on-dark-2 hover:text-white"}`}
        >
          <Icon size={13} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Card title="Stock ledger" extra={extra} actions={rows.length > 0 ? toggle : undefined}>
      {rows.length === 0 ? (
        <EmptyState title="No departments yet" description="The ledger will populate once departments and movements exist." />
      ) : view === "chart" && rawMax === 0 ? (
        <EmptyState title="No stock value yet" description="Nothing has been opened, received or issued for this date. Switch to Table to see each department." />
      ) : view === "chart" ? (
        <div className="px-4.5 pb-4.5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-n600 mb-3">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <i className={`w-2.5 h-2.5 rounded-[3px] ${s.swatch}`} />
                {s.label}
              </span>
            ))}
          </div>
          <div className="flex gap-2.5">
            <div className="hidden min-[700px]:flex flex-col justify-between h-[200px] w-11 text-right text-[10.5px] text-n600 tabular-nums -translate-y-1.5">
              {ticks.map((t) => (
                <span key={t}>{compactNaira(t)}</span>
              ))}
            </div>
            <div className="flex-1 min-w-0 relative bg-n50 rounded-[12px] pb-6">
              <div className="absolute inset-x-0 top-0 h-[200px] flex flex-col justify-between pointer-events-none" aria-hidden>
                {ticks.map((t) => (
                  <i key={t} className="block border-t border-n200" />
                ))}
              </div>
              <div className="relative h-[200px] flex justify-around items-end px-1">
                {rows.map((r) => {
                  const on = active === r.departmentId;
                  return (
                    <button
                      key={r.departmentId}
                      type="button"
                      onMouseEnter={() => setActive(r.departmentId)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(r.departmentId)}
                      onBlur={() => setActive(null)}
                      onClick={() => setActive(on ? null : r.departmentId)}
                      aria-label={`${r.departmentName}: opening ${formatNaira(r.openingValue)}, received ${formatNaira(r.receivedValue)}, issued ${formatNaira(r.issuedValue)}, closing ${formatNaira(r.closingValue)}`}
                      className={`relative h-full flex-1 max-w-[150px] flex items-end justify-center gap-[3px] min-[700px]:gap-[5px] rounded-[12px] outline-none ${
                        on ? "bg-brand-soft/70" : ""
                      }`}
                    >
                      {SERIES.map((s) => {
                        const v = r[s.key];
                        return (
                          <i
                            key={s.key}
                            className={`block w-2 min-[700px]:w-3.5 rounded-t-[5px] rounded-b-[2px] ${s.swatch}`}
                            style={{ height: `${v > 0 ? Math.max(1.5, (v / max) * 100) : 0}%` }}
                          />
                        );
                      })}
                      <span
                        className={`absolute -bottom-5.5 inset-x-0 text-center truncate text-[10.5px] tracking-[0.02em] ${
                          on ? "text-ink font-medium" : "text-n600"
                        }`}
                      >
                        {r.departmentName}
                      </span>
                      {on ? (
                        <span className="absolute z-10 bottom-[calc(100%-36px)] left-1/2 -translate-x-1/2 min-[700px]:translate-x-0 min-[700px]:left-[60%] w-[190px] text-left bg-ink text-white rounded-[12px] px-3 py-2.5 shadow-lift pointer-events-none">
                          <b className="block text-[11.5px] font-medium mb-1">{r.departmentName}</b>
                          <TipRow label="Opening" value={formatNaira(r.openingValue)} />
                          <TipRow label="Received" value={`+${formatNaira(r.receivedValue)}`} className="text-brand-bright" />
                          <TipRow label="Issued" value={`−${formatNaira(r.issuedValue)}`} className="text-red-on-dark" />
                          <TipRow label="Closing" value={formatNaira(r.closingValue)} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Department", "Opening", "Received", "Issued", "Closing", "Products", ""].map((h, i) => (
                  <th key={h + i} className={`${TH} ${i > 0 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.departmentId} className="border-b border-n200 hover:bg-n50">
                  <td className={TD}>{row.departmentName}</td>
                  <td className={`${TD} text-right`}>{formatNaira(row.openingValue)}</td>
                  <td className={`${TD} text-right text-green`}>+{formatNaira(row.receivedValue)}</td>
                  <td className={`${TD} text-right text-red`}>−{formatNaira(row.issuedValue)}</td>
                  <td className={`${TD} text-right font-medium`}>{formatNaira(row.closingValue)}</td>
                  <td className={`${TD} text-right text-n600`}>{row.productCount}</td>
                  <td className={`${TD} text-right`}>
                    <Link href={`/ledger?department=${row.departmentId}`} className="text-brand font-medium">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              <tr className="bg-n50">
                <td className={`${TD} font-medium`}>Total</td>
                <td className={`${TD} text-right font-medium`}>{formatNaira(totals.openingValue)}</td>
                <td className={`${TD} text-right font-medium`}>+{formatNaira(totals.receivedValue)}</td>
                <td className={`${TD} text-right font-medium`}>−{formatNaira(totals.issuedValue)}</td>
                <td className={`${TD} text-right font-medium`}>{formatNaira(totals.closingValue)}</td>
                <td className={`${TD} text-right font-medium text-n600`}>{totals.productCount}</td>
                <td className={TD} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TipRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className="flex justify-between gap-3 text-[11px] leading-[1.7] text-on-dark-2">
      {label}
      <em className={`not-italic tabular-nums ${className ?? "text-white"}`}>{value}</em>
    </span>
  );
}
