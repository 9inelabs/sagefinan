import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Tag } from "@/components/ui/Tag";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOverrideCount } from "@/lib/movements/actions";
import { getDashboardData, type DepartmentCountRow } from "@/lib/dashboard/actions";
import { formatNaira } from "@/lib/format";
import { todayIso, formatLongDate, formatWeekdayDate } from "@/lib/dates";

const STATUS_TAG: Record<DepartmentCountRow["status"], { variant: "mut" | "acc" | "warn"; label: string; action: string; href: (r: DepartmentCountRow) => string }> = {
  NOT_STARTED: { variant: "mut", label: "Not started", action: "Count", href: () => "/count" },
  DRAFT: { variant: "acc", label: "In progress", action: "Continue", href: (r) => `/count/${r.sessionId}` },
  COMPLETED: { variant: "warn", label: "Needs reconciling", action: "Reconcile", href: (r) => `/reconcile/${r.sessionId}` },
  LOCKED: { variant: "mut", label: "Locked", action: "View", href: (r) => `/reconcile/${r.sessionId}` },
};

function signedValue(value: number) {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}${formatNaira(value)}`;
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    return <ScopedHome role={profile.role} departmentName={profile.departmentName} />;
  }

  const [overrideCount, data] = await Promise.all([getOverrideCount(), getDashboardData()]);
  const { departmentRows, ledgerRows, ledgerTotals, stats, repeatVariances, recentMovements, businessDay } = data;

  return (
    <PageShell
      title="Dashboard"
      subtitle={`${formatLongDate(todayIso())} · as at close of ${formatWeekdayDate(businessDay)}`}
      actions={
        <Link href="/count">
          <Btn variant="acc">Start count</Btn>
        </Link>
      }
    >
      <div className="grid grid-cols-2 min-[900px]:grid-cols-5 gap-3 mb-4.5">
        <Stat label="Counted today" value={String(stats.countedDepartments)} hint={`/ ${stats.activeDepartments}`} />
        <Stat
          label="Items with variance"
          value={String(stats.varianceLineCount)}
          colorClassName={stats.varianceLineCount > 0 ? "text-red" : undefined}
        />
        <Stat
          label="Variance value"
          value={stats.varianceValue === 0 ? formatNaira(0) : signedValue(stats.varianceValue)}
          colorClassName={stats.varianceValue < 0 ? "text-red" : stats.varianceValue > 0 ? "text-green" : undefined}
        />
        <Link href="/reconcile">
          <Stat label="Awaiting reconciliation" value={String(stats.awaitingReconciliation)} hint="sessions" />
        </Link>
        <Link href="/movements?override=1">
          <Stat label="Flagged for review" value={String(overrideCount)} hint="overrides" colorClassName={overrideCount > 0 ? "text-amber" : undefined} />
        </Link>
      </div>

      <Card title="Today's counts" extra={`as at close of ${formatWeekdayDate(businessDay)}`} className="mb-4">
        {departmentRows.length === 0 ? (
          <EmptyState
            title="No departments yet"
            description="Add a department before counting can begin."
            action={
              <Link href="/departments" className="text-teal text-sm">
                Go to Departments →
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Department", "Products", "Counted", "Variances", "Value", "Status", ""].map((h, i) => (
                    <th
                      key={h + i}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 0 && i < 5 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departmentRows.map((row) => {
                  const statusMeta = STATUS_TAG[row.status];
                  return (
                    <tr key={row.departmentId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{row.departmentName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{row.productCount}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                        {row.countedCount ?? <span className="text-n600">—</span>}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                        {row.varianceCount != null ? (
                          <span className={row.varianceCount > 0 ? "text-red font-medium" : undefined}>{row.varianceCount}</span>
                        ) : (
                          <span className="text-n600">—</span>
                        )}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                        {row.varianceValue != null ? (
                          row.varianceValue === 0 ? (
                            <span className="text-n600">—</span>
                          ) : (
                            <span className={row.varianceValue < 0 ? "text-red font-medium" : "text-green font-medium"}>{signedValue(row.varianceValue)}</span>
                          )
                        ) : (
                          <span className="text-n600">—</span>
                        )}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        <Tag variant={statusMeta.variant}>{statusMeta.label}</Tag>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right whitespace-nowrap">
                        <Link href={statusMeta.href(row)} className="text-teal">
                          {statusMeta.action}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Stock ledger" extra={`All departments · as at ${formatWeekdayDate(businessDay)}`} className="mb-4">
        {ledgerRows.length === 0 ? (
          <EmptyState title="No departments yet" description="The ledger will populate once departments and movements exist." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Department", "Opening", "Received", "Issued", "Closing", "Products", ""].map((h, i) => (
                    <th
                      key={h + i}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 0 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((row) => (
                  <tr key={row.departmentId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{row.departmentName}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(row.openingValue)}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-green tabular-nums whitespace-nowrap">+{formatNaira(row.receivedValue)}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-red tabular-nums whitespace-nowrap">−{formatNaira(row.issuedValue)}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap">{formatNaira(row.closingValue)}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{row.productCount}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right whitespace-nowrap">
                      <Link href="/ledger" className="text-teal">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="bg-n50">
                  <td className="px-4 h-9 text-[13.5px] font-medium whitespace-nowrap">Total</td>
                  <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">{formatNaira(ledgerTotals.openingValue)}</td>
                  <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">+{formatNaira(ledgerTotals.receivedValue)}</td>
                  <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">−{formatNaira(ledgerTotals.issuedValue)}</td>
                  <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">{formatNaira(ledgerTotals.closingValue)}</td>
                  <td className="px-4 h-9 text-[13.5px] font-medium text-right text-n600 tabular-nums whitespace-nowrap">{ledgerTotals.productCount}</td>
                  <td className="px-4 h-9" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid min-[900px]:grid-cols-[1fr_300px] gap-4 items-start">
        <Card title="Repeat variances" extra="last 30 days">
          {repeatVariances.length === 0 ? (
            <EmptyState title="No repeat variances" description="No product has shown a variance more than once in the last 30 days." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Product", "Department", "Occurrences", "Total", "Value"].map((h, i) => (
                      <th
                        key={h}
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
                  {repeatVariances.map((row) => (
                    <tr key={`${row.productId}`} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{row.productName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{row.departmentName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{row.occurrences}</td>
                      <td
                        className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                          row.totalVariance < 0 ? "text-red font-medium" : "text-green font-medium"
                        }`}
                      >
                        {row.totalVariance > 0 ? `+${row.totalVariance}` : row.totalVariance}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(row.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Movements today">
          {recentMovements.length === 0 ? (
            <EmptyState title="No movements yet" description="Purchases, requisitions and sales will appear here as they're posted." />
          ) : (
            <div>
              {recentMovements.map((m) => (
                <div key={m.id} className="border-b border-n200 last:border-b-0 px-4 py-[13px]">
                  <div className="flex justify-between items-center">
                    <b className="font-medium text-sm">
                      {m.type === "PURCHASE" ? "Purchase" : m.type === "OPENING" ? "Opening balance" : m.type === "REQUISITION" ? "Requisition" : "Sale"}
                    </b>
                    <span className="text-n600 text-xs tabular-nums">
                      {new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-n600 text-[12.5px] mt-[3px]">{m.detail}</div>
                  <div className="text-n600 text-xs mt-0.5">by {m.createdByName}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function ScopedHome({ role, departmentName }: { role: "STOREKEEPER" | "DEPARTMENT_USER"; departmentName: string | null }) {
  const shortcuts =
    role === "STOREKEEPER"
      ? [
          { label: "Go to Purchases", href: "/purchases" },
          { label: "Go to Requisitions", href: "/requisitions" },
        ]
      : [{ label: "Go to Sales entry", href: "/sales" }];

  return (
    <PageShell title="Sagefinan" subtitle={departmentName ?? undefined}>
      <Card title="Welcome">
        <div className="p-4 text-sm text-n600 leading-relaxed">
          <p className="mb-3">
            Signed in for <b className="text-ink font-medium">{departmentName ?? "your department"}</b>.
          </p>
          <div className="flex flex-col gap-2 items-start">
            {shortcuts.map((s) => (
              <Link key={s.href} href={s.href} className="text-teal">
                {s.label} →
              </Link>
            ))}
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
