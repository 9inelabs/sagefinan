import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountDepartments } from "@/lib/counts/actions";
import { getRepeatVarianceReport } from "@/lib/reconcile/actions";
import { formatNaira } from "@/lib/format";
import { thirtyDaysAgoIso, todayIso } from "@/lib/dates";
import { RepeatVarianceFilters } from "./RepeatVarianceFilters";
import { ReportsTabs } from "../../ReportsTabs";

type SearchParams = { department?: string; from?: string; to?: string; sort?: string };

export default async function RepeatVariancesReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const params = await searchParams;
  const from = params.from || thirtyDaysAgoIso();
  const to = params.to || todayIso();
  const sort = params.sort === "value" ? "value" : "occurrences";

  const [departments, rows] = await Promise.all([
    listCountDepartments(),
    getRepeatVarianceReport({ departmentId: params.department || undefined, from, to, sort }),
  ]);

  const exportSp = new URLSearchParams();
  if (params.department) exportSp.set("department", params.department);
  exportSp.set("from", from);
  exportSp.set("to", to);
  exportSp.set("sort", sort);

  return (
    <PageShell
      title="Repeat variances"
      subtitle="Products that come up short (or excess) across more than one count — a real finding, not noise"
      actions={
        <div className="flex gap-2">
          <Link href={`/reconcile/reports/repeat-variances/export?${exportSp.toString()}`}>
            <Btn>Export CSV</Btn>
          </Link>
          <Link href={`/reconcile/reports/repeat-variances/export-pdf?${exportSp.toString()}`}>
            <Btn>Export PDF</Btn>
          </Link>
        </div>
      }
    >
      <ReportsTabs active="/reconcile/reports/repeat-variances" />

      <Card title="Repeat variances" extra={`${rows.length} product${rows.length === 1 ? "" : "s"} · ${from} – ${to}`}>
        <RepeatVarianceFilters
          departments={departments}
          initial={{ department: params.department ?? "", from, to, sort }}
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No repeat variances in range"
            description="No product has shown a variance across more than one finished session in this range and department."
          />
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
                {rows.map((r) => {
                  const drillSp = new URLSearchParams();
                  drillSp.set("department", r.departmentId);
                  drillSp.set("from", from);
                  drillSp.set("to", to);
                  return (
                    <tr key={`${r.productId}:${r.departmentId}`} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-0 h-9">
                        <Link
                          href={`/reconcile/reports/repeat-variances/${r.productId}?${drillSp.toString()}`}
                          className="flex items-center h-9 px-4 text-[13.5px] text-teal whitespace-nowrap"
                        >
                          {r.productName} <span className="text-n600 text-xs ml-1.5">{r.productCode}</span>
                        </Link>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{r.departmentName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.occurrences}</td>
                      <td
                        className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                          r.totalVariance < 0 ? "text-red font-medium" : "text-green font-medium"
                        }`}
                      >
                        {r.totalVariance > 0 ? `+${r.totalVariance}` : r.totalVariance}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(r.totalValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
