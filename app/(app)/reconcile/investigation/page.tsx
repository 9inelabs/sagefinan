import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountDepartments } from "@/lib/counts/actions";
import { getUnderInvestigationLines } from "@/lib/reconcile/actions";
import { InvestigationFilter } from "./InvestigationFilter";
import { ReportsTabs } from "../ReportsTabs";

type SearchParams = { department?: string };

export default async function UnderInvestigationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const params = await searchParams;
  const departmentId = params.department || undefined;

  const [departments, lines] = await Promise.all([listCountDepartments(), getUnderInvestigationLines({ departmentId })]);

  const exportSp = new URLSearchParams();
  if (departmentId) exportSp.set("department", departmentId);

  return (
    <PageShell title="Under investigation" subtitle="Every line still holding this status, across every session — locked or not">
      <ReportsTabs active="/reconcile/investigation" />
      <Card title="Open items" extra={`${lines.length} line${lines.length === 1 ? "" : "s"}`}>
        <InvestigationFilter departments={departments} initial={departmentId ?? ""} />

        {lines.length === 0 ? (
          <EmptyState title="Nothing under investigation" description="No open item is currently holding this status." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["As at", "Department", "Product", "Kind", "Expected", "Counted", "Ledger", "Variance", "Note", "Session"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 3 && i < 8 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={`${l.countLineId}-${l.kind}`} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                    <td className="px-4 h-9 text-[13.5px] tabular-nums whitespace-nowrap">{l.asAtDate}</td>
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{l.departmentName}</td>
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                      {l.name} <span className="text-n600 text-xs">{l.code}</span>
                    </td>
                    <td className="px-4 h-9 whitespace-nowrap">
                      <Tag variant={l.kind === "variance" ? "bad" : "warn"}>{l.kind === "variance" ? "Physical variance" : "Book differs"}</Tag>
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.expectedQty}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.countedQty}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.ledgerQty ?? "—"}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{l.variance > 0 ? `+${l.variance}` : l.variance}</td>
                    <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{l.note ?? "—"}</td>
                    <td className="px-0 h-9">
                      <Link href={`/reconcile/${l.sessionId}`} className="flex items-center h-9 px-4 text-teal text-sm whitespace-nowrap">
                        {l.sessionStatus === "LOCKED" ? "View" : "Reconcile"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-n200 flex justify-end">
          <Link href={`/reconcile/investigation/export?${exportSp.toString()}`}>
            <Btn>Export CSV</Btn>
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
