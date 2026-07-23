import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountDepartments } from "@/lib/counts/actions";
import { getVarianceByReasonReport } from "@/lib/reconcile/actions";
import { formatNaira } from "@/lib/format";
import { ReportFilters } from "./ReportFilters";

type SearchParams = { department?: string; from?: string; to?: string };

export default async function VarianceReasonReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const params = await searchParams;
  const filters = { departmentId: params.department || undefined, from: params.from || undefined, to: params.to || undefined };

  const [departments, { varianceRows, bookDiffRows }] = await Promise.all([listCountDepartments(), getVarianceByReasonReport(filters)]);

  const exportSp = new URLSearchParams();
  if (filters.departmentId) exportSp.set("department", filters.departmentId);
  if (filters.from) exportSp.set("from", filters.from);
  if (filters.to) exportSp.set("to", filters.to);

  return (
    <PageShell title="Variance reasons report" subtitle="How many lines, total quantity and value, per reason code">
      <div className="flex flex-col gap-4">
        <Card title="Filters">
          <ReportFilters departments={departments} initial={{ department: params.department ?? "", from: params.from ?? "", to: params.to ?? "" }} />
        </Card>

        <Card title="Physical variances by reason">
          {varianceRows.length === 0 ? (
            <EmptyState title="No reasoned variances in range" description="Try a wider date range or a different department." />
          ) : (
            <ReasonTable rows={varianceRows} showValue />
          )}
          <div className="p-4 border-t border-n200 flex justify-end">
            <Link href={`/reconcile/reports/export?${exportSp.toString()}`}>
              <Btn>Export CSV</Btn>
            </Link>
          </div>
        </Card>

        <Card title="Book differences by reason" extra="A posting discrepancy, not a physical loss — no currency value is computed">
          {bookDiffRows.length === 0 ? (
            <EmptyState title="No reasoned book differences in range" description="Try a wider date range or a different department." />
          ) : (
            <ReasonTable rows={bookDiffRows} showValue={false} />
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function ReasonTable({
  rows,
  showValue,
}: {
  rows: { reasonCodeId: string; label: string; lineCount: number; totalQuantity: number; totalValue: number | null }[];
  showValue: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Reason", "Lines", "Total quantity", ...(showValue ? ["Total value"] : [])].map((h, i) => (
              <th
                key={h}
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
          {rows.map((r) => {
            const sign = r.totalQuantity < 0 ? "−" : r.totalQuantity > 0 ? "+" : "";
            const valueSign = (r.totalValue ?? 0) < 0 ? "−" : (r.totalValue ?? 0) > 0 ? "+" : "";
            return (
              <tr key={r.reasonCodeId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{r.label}</td>
                <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.lineCount}</td>
                <td
                  className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                    r.totalQuantity < 0 ? "text-red font-medium" : r.totalQuantity > 0 ? "text-green font-medium" : ""
                  }`}
                >
                  {sign}
                  {Math.abs(r.totalQuantity)}
                </td>
                {showValue ? (
                  <td
                    className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                      (r.totalValue ?? 0) < 0 ? "text-red font-medium" : (r.totalValue ?? 0) > 0 ? "text-green font-medium" : ""
                    }`}
                  >
                    {r.totalValue == null ? "—" : `${valueSign}${formatNaira(r.totalValue)}`}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
