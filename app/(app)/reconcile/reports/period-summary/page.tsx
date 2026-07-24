import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountDepartments } from "@/lib/counts/actions";
import { getPeriodSummary } from "@/lib/reconcile/actions";
import { formatNaira } from "@/lib/format";
import { monthStartIso, todayIso } from "@/lib/dates";
import { PeriodSummaryFilters } from "./PeriodSummaryFilters";
import { ReportsTabs } from "../../ReportsTabs";

type SearchParams = { department?: string; from?: string; to?: string };

function signed(value: number) {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}${formatNaira(value)}`;
}

export default async function PeriodSummaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const params = await searchParams;
  const departments = await listCountDepartments();

  if (departments.length === 0) {
    return (
      <PageShell title="Period summary">
        <ReportsTabs active="/reconcile/reports/period-summary" />
        <Card title="Period summary">
          <EmptyState title="No department to show" description="Add a department first." />
        </Card>
      </PageShell>
    );
  }

  const departmentId = departments.find((d) => d.id === params.department)?.id ?? departments[0].id;
  const from = params.from || monthStartIso();
  const to = params.to || todayIso();

  const summary = await getPeriodSummary({ departmentId, from, to });

  const exportSp = new URLSearchParams();
  exportSp.set("department", departmentId);
  exportSp.set("from", from);
  exportSp.set("to", to);

  const receivedLabel = summary.isCentralStore ? "Purchases" : "Received";
  const issuedLabel = summary.isCentralStore ? "Requisitions out" : "Issued";

  return (
    <PageShell
      title="Period summary"
      subtitle={`${summary.departmentName} · ${from} – ${to} · a concise one-page view for management`}
      actions={
        <Link href={`/reconcile/reports/period-summary/export-pdf?${exportSp.toString()}`}>
          <Btn>Export PDF</Btn>
        </Link>
      }
    >
      <ReportsTabs active="/reconcile/reports/period-summary" />

      <Card title="Period summary" extra={`${summary.departmentName} · ${from} – ${to}`}>
        <PeriodSummaryFilters departments={departments} initial={{ department: departmentId, from, to }} />

        <div className="p-4 grid grid-cols-2 min-[900px]:grid-cols-3 gap-3">
          <Stat label="Opening value" value={formatNaira(summary.openingValue)} />
          <Stat label={receivedLabel} value={"+" + formatNaira(summary.receivedValue)} colorClassName="text-green" />
          <Stat label={issuedLabel} value={"−" + formatNaira(summary.issuedValue)} colorClassName="text-red" />
          <Stat label="Closing value" value={formatNaira(summary.closingValue)} />
          <Stat
            label="Variance value"
            value={summary.varianceValue === 0 ? formatNaira(0) : signed(summary.varianceValue)}
            hint={`${summary.varianceLineCount} line${summary.varianceLineCount === 1 ? "" : "s"}`}
            colorClassName={summary.varianceValue < 0 ? "text-red" : summary.varianceValue > 0 ? "text-green" : undefined}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4 mt-4">
        <Card title="Variance by reason">
          {summary.varianceRows.length === 0 ? (
            <EmptyState title="No reasoned variances" description="No physical variance was reasoned in this period." />
          ) : (
            <ReasonTable rows={summary.varianceRows} showValue />
          )}
        </Card>
        <Card title="Book differences by reason" extra="No currency value — a posting discrepancy, not a physical loss">
          {summary.bookDiffRows.length === 0 ? (
            <EmptyState title="No reasoned book differences" description="No book/ledger disagreement was reasoned in this period." />
          ) : (
            <ReasonTable rows={summary.bookDiffRows} showValue={false} />
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
            {["Reason", "Lines", "Qty", ...(showValue ? ["Value"] : [])].map((h, i) => (
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
            return (
              <tr key={r.reasonCodeId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{r.label}</td>
                <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.lineCount}</td>
                <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                  {sign}
                  {Math.abs(r.totalQuantity)}
                </td>
                {showValue ? (
                  <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                    {r.totalValue == null ? "—" : formatNaira(r.totalValue)}
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
