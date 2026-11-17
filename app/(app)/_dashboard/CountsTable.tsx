"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatNaira } from "@/lib/format";
import type { DepartmentCountRow } from "@/lib/dashboard/actions";

type Status = DepartmentCountRow["status"];

const STATUS: Record<Status, { variant: "mut" | "acc" | "warn"; label: string; action: string; href: (r: DepartmentCountRow) => string }> = {
  NOT_STARTED: { variant: "mut", label: "Not started", action: "Count", href: () => "/count" },
  DRAFT: { variant: "acc", label: "In progress", action: "Continue", href: (r) => `/count/${r.sessionId}` },
  COMPLETED: { variant: "warn", label: "Needs reconciling", action: "Reconcile", href: (r) => `/reconcile/${r.sessionId}` },
  LOCKED: { variant: "mut", label: "Locked", action: "View", href: (r) => `/reconcile/${r.sessionId}` },
};

const TH = "text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap";
const TD = "px-4 py-2 text-[12.5px] tabular-nums whitespace-nowrap";

function signedValue(value: number) {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}${formatNaira(value)}`;
}

function initials(name: string) {
  const words = name.split(/[\s-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

// Today's counts — one row per active department with a counted-progress
// bar, its variance figures and the next action. The status filter is a
// view filter over the rows already loaded, not a new query.
export function CountsTable({ rows, extra }: { rows: DepartmentCountRow[]; extra: string }) {
  const [status, setStatus] = useState<"" | Status>("");
  const visible = status ? rows.filter((r) => r.status === status) : rows;

  const filter = (
    <label className="relative inline-flex items-center">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as "" | Status)}
        aria-label="Filter by status"
        className="appearance-none bg-ink text-white text-[11.5px] rounded-[9px] pl-2.5 pr-7 py-[5px] outline-none focus-visible:ring-2 focus-visible:ring-brand-bright"
      >
        <option value="">All statuses</option>
        {(Object.keys(STATUS) as Status[]).map((s) => (
          <option key={s} value={s}>
            {STATUS[s].label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={1.75} className="absolute right-2 text-white pointer-events-none" />
    </label>
  );

  return (
    <Card title="Today's counts" extra={extra} actions={rows.length > 0 ? filter : undefined}>
      {rows.length === 0 ? (
        <EmptyState
          title="No departments yet"
          description="Add a department before counting can begin."
          action={
            <Link href="/departments" className="text-brand text-sm font-medium">
              Go to Departments →
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <p className="px-4.5 pb-5 text-[12.5px] text-n600">No department is “{STATUS[status as Status].label.toLowerCase()}” right now.</p>
      ) : (
        <>
          <div className="overflow-x-auto max-[699px]:hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Department</th>
                  <th className={TH}>Counted</th>
                  <th className={`${TH} text-right`}>Variances</th>
                  <th className={`${TH} text-right`}>Value</th>
                  <th className={TH}>Status</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const s = STATUS[row.status];
                  return (
                    <tr key={row.departmentId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className={TD}>
                        <DeptCell name={row.departmentName} sub={`${row.productCount} products`} />
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-2.5">
                          <Progress counted={row.countedCount} total={row.productCount} className="w-[76px]" />
                          <span>
                            {row.countedCount ?? "—"}
                            <span className="text-n600 text-[11px]"> / {row.productCount}</span>
                          </span>
                        </div>
                      </td>
                      <td className={`${TD} text-right`}>
                        {row.varianceCount != null ? (
                          <span className={row.varianceCount > 0 ? "text-red font-medium" : undefined}>{row.varianceCount}</span>
                        ) : (
                          <span className="text-n600">—</span>
                        )}
                      </td>
                      <td className={`${TD} text-right`}>
                        <ValueCell value={row.varianceValue} />
                      </td>
                      <td className={TD}>
                        <Tag variant={s.variant}>{s.label}</Tag>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Link href={s.href(row)} className="inline-flex items-center gap-0.5 text-brand font-medium">
                          {s.action}
                          <ChevronRight size={13} strokeWidth={2} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="min-[700px]:hidden">
            {visible.map((row) => {
              const s = STATUS[row.status];
              return (
                <div key={row.departmentId} className="border-t border-n200 px-4 py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                  <DeptCell name={row.departmentName} sub={`${row.countedCount ?? "—"} / ${row.productCount} counted`} />
                  <Tag variant={s.variant}>{s.label}</Tag>
                  <Progress counted={row.countedCount} total={row.productCount} className="col-span-2" />
                  <div className="col-span-2 flex items-center gap-3.5 text-[11.5px] text-n600">
                    <span>
                      Variances{" "}
                      <b className={`font-medium ${row.varianceCount ? "text-red" : "text-ink"}`}>{row.varianceCount ?? "—"}</b>
                    </span>
                    <span>
                      Value <ValueCell value={row.varianceValue} />
                    </span>
                    <Link href={s.href(row)} className="ml-auto inline-flex items-center gap-0.5 text-brand font-medium text-[12px]">
                      {s.action}
                      <ChevronRight size={13} strokeWidth={2} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function DeptCell({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-7.5 h-7.5 rounded-full grid place-items-center flex-none bg-brand-soft text-brand text-[10.5px] font-medium">{initials(name)}</span>
      <div className="min-w-0">
        <b className="block font-medium text-[12.5px] truncate">{name}</b>
        <span className="block text-[11px] text-n600">{sub}</span>
      </div>
    </div>
  );
}

function Progress({ counted, total, className }: { counted: number | null; total: number; className?: string }) {
  const pct = counted == null || total === 0 ? 0 : Math.min(100, (counted / total) * 100);
  return (
    <div className={`h-1.5 rounded-full bg-n100 overflow-hidden ${className ?? ""}`} aria-hidden>
      <i className="block h-full rounded-full bg-brand-bright" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ValueCell({ value }: { value: number | null }) {
  if (value == null || value === 0) return <span className="text-n600">—</span>;
  return <span className={`font-medium ${value < 0 ? "text-red" : "text-green"}`}>{signedValue(value)}</span>;
}
