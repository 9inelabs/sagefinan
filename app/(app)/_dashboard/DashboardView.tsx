import Link from "next/link";
import {
  Archive,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Flag,
  PackageMinus,
  PackagePlus,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "@/components/app-shell/PageShell";
import { MessagesButton } from "@/components/app-shell/MessagesButton";
import { Card } from "@/components/ui/Card";
import { Stat, type StatBar } from "@/components/ui/Stat";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DashboardData, RecentMovementRow } from "@/lib/dashboard/actions";
import { formatNaira } from "@/lib/format";
import { todayIso, formatLongDate, formatWeekdayDate } from "@/lib/dates";
import { DashboardDepartmentFilter } from "../DashboardDepartmentFilter";
import { LedgerChart } from "./LedgerChart";
import { CountsTable } from "./CountsTable";

const MOVEMENT_META: Record<RecentMovementRow["type"], { label: string; icon: LucideIcon }> = {
  PURCHASE: { label: "Purchase", icon: ShoppingBag },
  REQUISITION: { label: "Requisition", icon: ArrowLeftRight },
  SALE: { label: "Sale", icon: Receipt },
  OPENING: { label: "Opening balance", icon: TrendingUp },
  ADJUSTMENT: { label: "Adjustment", icon: SlidersHorizontal },
};

const TH = "text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap";
const TD = "px-4 py-2 text-[12.5px] tabular-nums whitespace-nowrap";

function signedValue(value: number) {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}${formatNaira(value)}`;
}

// Presentational half of the dashboard — everything below renders from
// already-fetched data, kept separate from the fetching above.
export function DashboardView({
  data,
  departments,
  departmentId,
  overrideCount,
}: {
  data: DashboardData;
  departments: { id: string; name: string }[];
  departmentId: string;
  overrideCount: number;
}) {
  const { departmentRows, ledgerRows, ledgerTotals, stats, repeatVariances, recentMovements, businessDay } = data;
  const asAt = formatWeekdayDate(businessDay);
  const scopeName = departmentId ? departments.find((d) => d.id === departmentId)?.name : null;

  // Per-department mini bars on the first three stat tiles — the same rows
  // the Today's counts table shows, just drawn small.
  const countedBars: StatBar[] = departmentRows.map((r) => {
    const ratio = r.countedCount && r.productCount ? r.countedCount / r.productCount : 0;
    return { value: ratio, tone: r.status === "COMPLETED" || r.status === "LOCKED" ? "brand" : ratio > 0 ? "brand-dim" : "empty" };
  });
  const varianceCountBars: StatBar[] = departmentRows.map((r) => ({ value: r.varianceCount ?? 0, tone: r.varianceCount ? "red" : "empty" }));
  const varianceValueBars: StatBar[] = departmentRows.map((r) => ({
    value: r.varianceValue ?? 0,
    tone: (r.varianceValue ?? 0) < 0 ? "red" : (r.varianceValue ?? 0) > 0 ? "brand" : "empty",
  }));
  const deptsWithVariance = departmentRows.filter((r) => (r.varianceCount ?? 0) > 0).length;
  const netChange = ledgerTotals.closingValue - ledgerTotals.openingValue;

  return (
    <PageShell
      title="Dashboard"
      subtitle={`${formatLongDate(todayIso())} · as at close of ${asAt}`}
      actions={
        <>
          <span className="hidden min-[900px]:contents">
            <MessagesButton />
          </span>
          <DashboardDepartmentFilter departments={departments} initial={departmentId} />
          <Link href="/count">
            <Btn variant="acc" className="h-9.5">
              <Plus size={15} strokeWidth={2} className="text-brand-bright" />
              Start count
            </Btn>
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 min-[700px]:grid-cols-3 min-[1180px]:grid-cols-[1.25fr_repeat(4,1fr)] gap-2.5 min-[900px]:gap-3 mb-2.5 min-[900px]:mb-3">
        <div className="col-span-2 min-[700px]:col-span-1">
          <Stat
            variant="hero"
            label="Counted today"
            value={String(stats.countedDepartments)}
            hint={`/ ${stats.activeDepartments}`}
            footer={
              <span className="inline-flex items-center gap-1">
                <ArrowUpRight size={13} strokeWidth={2} className="text-brand-bright" />
                departments finished
              </span>
            }
            bars={countedBars}
          />
        </div>
        <Stat
          label="Items with variance"
          value={String(stats.varianceLineCount)}
          colorClassName={stats.varianceLineCount > 0 ? "text-red" : undefined}
          footer={deptsWithVariance > 0 ? `across ${deptsWithVariance} department${deptsWithVariance === 1 ? "" : "s"}` : "none so far"}
          bars={varianceCountBars}
        />
        <Stat
          label="Variance value"
          value={stats.varianceValue === 0 ? formatNaira(0) : signedValue(stats.varianceValue)}
          colorClassName={stats.varianceValue < 0 ? "text-red" : stats.varianceValue > 0 ? "text-green" : undefined}
          footer={
            stats.varianceValue === 0 ? (
              "no net variance"
            ) : (
              <span className="inline-flex items-center gap-1">
                {stats.varianceValue < 0 ? (
                  <ArrowDownRight size={13} strokeWidth={2} className="text-red" />
                ) : (
                  <ArrowUpRight size={13} strokeWidth={2} className="text-green" />
                )}
                {stats.varianceValue < 0 ? "net shortage" : "net excess"}
              </span>
            )
          }
          bars={varianceValueBars}
        />
        <Link href="/reconcile" className="block rounded-premium hover:-translate-y-px transition-transform">
          <Stat
            label="Awaiting reconciliation"
            value={String(stats.awaitingReconciliation)}
            hint="sessions"
            icon={RefreshCw}
            footer={<FooterLink>Open Reconcile</FooterLink>}
          />
        </Link>
        <Link href="/movements?override=1" className="block rounded-premium hover:-translate-y-px transition-transform">
          <Stat
            label="Flagged for review"
            value={String(overrideCount)}
            hint="overrides"
            colorClassName={overrideCount > 0 ? "text-amber" : undefined}
            icon={Flag}
            iconTone="amber"
            footer={<FooterLink>View movements</FooterLink>}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 min-[1180px]:grid-cols-[minmax(0,1fr)_320px] gap-2.5 min-[900px]:gap-3 mb-2.5 min-[900px]:mb-3">
        <LedgerChart rows={ledgerRows} totals={ledgerTotals} extra={`${scopeName ?? "All departments"} · as at ${asAt}`} />

        <Card variant="tint" className="px-5 pt-5 pb-2">
          <span className="block text-[11.5px] text-n600">Total closing value</span>
          <b className="block text-[30px] min-[900px]:text-[32px] font-normal tracking-[-0.035em] leading-[1.1] mt-1.5 tabular-nums break-all">
            {formatNaira(ledgerTotals.closingValue)}
          </b>
          <span className="flex flex-wrap items-center gap-1 text-[12px] text-n600 mt-2 mb-3.5">
            {netChange < 0 ? (
              <ArrowDownRight size={14} strokeWidth={2} className="text-red" />
            ) : (
              <ArrowUpRight size={14} strokeWidth={2} className="text-brand" />
            )}
            <em className={`not-italic font-medium ${netChange < 0 ? "text-red" : "text-brand"}`}>{signedValue(netChange)}</em>
            since opening · {ledgerTotals.productCount} products
          </span>
          <SummaryItem icon={PackagePlus} label="Received" value={formatNaira(ledgerTotals.receivedValue)} note="purchases & requisitions in" />
          <SummaryItem icon={PackageMinus} label="Issued" value={formatNaira(ledgerTotals.issuedValue)} note="requisitions & sales out" />
          <SummaryItem icon={Archive} label="Opening" value={formatNaira(ledgerTotals.openingValue)} note="start of day" />
        </Card>
      </div>

      <div className="grid grid-cols-1 min-[1180px]:grid-cols-[minmax(0,1fr)_320px] gap-2.5 min-[900px]:gap-3 items-start">
        <div className="grid grid-cols-1 gap-2.5 min-[900px]:gap-3 min-w-0">
          <CountsTable rows={departmentRows} extra={`as at close of ${asAt}`} />

          <Card
            title="Repeat variances"
            extra="last 30 days"
            actions={
              <Link href="/reconcile/reports/repeat-variances" className="inline-flex items-center gap-0.5 text-[12px] text-brand font-medium">
                Full report
                <ChevronRight size={13} strokeWidth={2} />
              </Link>
            }
          >
            {repeatVariances.length === 0 ? (
              <EmptyState title="No repeat variances" description="No product has shown a variance more than once in the last 30 days." />
            ) : (
              <>
                <div className="overflow-x-auto max-[699px]:hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {["Product", "Department", "Occurrences", "Total", "Value"].map((h, i) => (
                          <th key={h} className={`${TH} ${i > 1 ? "text-right" : ""}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {repeatVariances.map((row) => (
                        <tr key={`${row.productId}-${row.departmentId}`} className="border-b border-n200 last:border-b-0 hover:bg-brand-hover">
                          <td className={TD}>
                            <b className="block font-medium">{row.productName}</b>
                            <span className="block text-[11px] text-n600">{row.productCode}</span>
                          </td>
                          <td className={`${TD} text-n600`}>{row.departmentName}</td>
                          <td className={`${TD} text-right`}>
                            <span className="inline-flex gap-[3px] mr-2 align-middle" aria-hidden>
                              {Array.from({ length: Math.min(row.occurrences, 6) }).map((_, i) => (
                                <i key={i} className="block w-[5px] h-[5px] rounded-full bg-red/70" />
                              ))}
                            </span>
                            {row.occurrences}
                          </td>
                          <td className={`${TD} text-right font-medium ${row.totalVariance < 0 ? "text-red" : "text-green"}`}>
                            {row.totalVariance > 0 ? `+${row.totalVariance}` : `−${Math.abs(row.totalVariance)}`}
                          </td>
                          <td className={`${TD} text-right`}>{formatNaira(row.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="min-[700px]:hidden">
                  {repeatVariances.map((row) => (
                    <div key={`${row.productId}-${row.departmentId}`} className="border-t border-n200 px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <b className="block font-medium text-[12.5px] truncate">{row.productName}</b>
                        <span className="block text-[11px] text-n600">
                          {row.departmentName} · {row.occurrences}× in 30 days
                        </span>
                      </div>
                      <div className="text-right flex-none tabular-nums">
                        <b className={`block font-medium text-[12.5px] ${row.totalVariance < 0 ? "text-red" : "text-green"}`}>
                          {row.totalVariance > 0 ? `+${row.totalVariance}` : `−${Math.abs(row.totalVariance)}`}
                        </b>
                        <span className="block text-[11px] text-n600">{formatNaira(row.totalValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <Card
          variant="dark"
          title="Movements today"
          actions={
            <span className="text-[11px] px-2.5 py-1 rounded-[8px] bg-white/8 border border-white/8 text-on-dark-2 whitespace-nowrap">
              {recentMovements.length === 0 ? "None yet" : `${recentMovements.length} latest`}
            </span>
          }
        >
          {recentMovements.length === 0 ? (
            <div className="px-4.5 pb-6 pt-2 text-[12px] text-on-dark-mut">Purchases, requisitions and sales will appear here as they&apos;re posted.</div>
          ) : (
            <div className="px-3 pb-1">
              {recentMovements.map((m, i) => {
                const meta = MOVEMENT_META[m.type];
                const Icon = meta.icon;
                return (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 px-2 py-2.5 rounded-[12px] ${i === 0 ? "bg-white/5 ring-1 ring-inset ring-white/6" : ""}`}
                  >
                    <div className="w-7.5 h-7.5 rounded-full grid place-items-center flex-none bg-brand-bright/15 text-brand-bright">
                      <Icon size={14} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <b className="font-medium text-[12.5px] text-on-dark">{meta.label}</b>
                        <span className="text-[11px] text-on-dark-mut tabular-nums">
                          {new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-on-dark-2 mt-0.5 break-words">{m.detail}</p>
                      <p className="text-[10.5px] text-on-dark-mut mt-0.5">by {m.createdByName}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link
            href="/movements"
            className="flex items-center justify-center gap-1 mx-3 mt-1 mb-3.5 py-2 rounded bg-white/6 hover:bg-white/10 text-[12px] text-on-dark-2"
          >
            All movements
            <ArrowRight size={13} strokeWidth={1.75} />
          </Link>
        </Card>
      </div>
    </PageShell>
  );
}

function FooterLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-brand font-medium">
      {children}
      <ArrowRight size={13} strokeWidth={1.75} />
    </span>
  );
}

function SummaryItem({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-t border-ink/7">
      <div className="w-9.5 h-9.5 rounded-full grid place-items-center flex-none bg-white/60 text-brand">
        <Icon size={18} strokeWidth={1.6} />
      </div>
      <div className="min-w-0">
        <b className="block text-[13.5px] font-medium">{label}</b>
        <span className="block text-[11.5px] text-n600 tabular-nums">
          {value} · {note}
        </span>
      </div>
    </div>
  );
}

export function ScopedHome({ role, departmentName }: { role: "STOREKEEPER" | "DEPARTMENT_USER"; departmentName: string | null }) {
  const shortcuts =
    role === "STOREKEEPER"
      ? [
          { label: "Purchases", note: "Receive stock into the central store", href: "/purchases", icon: ShoppingBag },
          { label: "Requisitions", note: "Issue stock to a department", href: "/requisitions", icon: ArrowLeftRight },
        ]
      : [{ label: "Sales entry", note: "Record yesterday's sales", href: "/sales", icon: Receipt }];

  return (
    <PageShell title="Welcome" subtitle={departmentName ?? undefined}>
      <div className="surface-hero rounded-premium px-5 py-5 mb-3">
        <span className="block text-[11.5px] text-on-dark-mut">Signed in for</span>
        <b className="block text-[22px] font-medium tracking-[-0.02em] mt-1">{departmentName ?? "your department"}</b>
      </div>
      <div className="grid min-[600px]:grid-cols-2 gap-3">
        {shortcuts.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.href} href={s.href} className="bg-white rounded-premium shadow-premium p-4 flex items-center gap-3 hover:-translate-y-px transition-transform">
              <span className="w-10 h-10 rounded-full grid place-items-center flex-none bg-brand-soft text-brand">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block font-medium text-[13.5px]">{s.label}</b>
                <span className="block text-[11.5px] text-n600">{s.note}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="text-n400" />
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
