import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountSessions, listCountDepartments, type SessionStatus } from "@/lib/counts/actions";
import { formatNaira } from "@/lib/format";
import { HistoryFilters } from "./HistoryFilters";

type SearchParams = { department?: string; from?: string; to?: string; status?: string; q?: string; page?: string };

const STATUS_TAG: Record<SessionStatus, { variant: "acc" | "warn" | "mut"; label: string }> = {
  DRAFT: { variant: "acc", label: "In progress" },
  COMPLETED: { variant: "warn", label: "Needs reconciling" },
  LOCKED: { variant: "mut", label: "Locked" },
};

function signed(value: number | null) {
  if (value == null) return "—";
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return value === 0 ? "—" : `${sign}${formatNaira(value)}`;
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const statuses = params.status ? ([params.status as SessionStatus]) : undefined;

  const filters = {
    departmentId: params.department || undefined,
    asAtFrom: params.from || undefined,
    asAtTo: params.to || undefined,
    statuses,
    productSearch: params.q || undefined,
  };

  const [departments, { rows, totalCount, totalPages }] = await Promise.all([
    listCountDepartments(),
    listCountSessions(filters, page),
  ]);

  const exportSp = new URLSearchParams();
  if (filters.departmentId) exportSp.set("department", filters.departmentId);
  if (filters.asAtFrom) exportSp.set("from", filters.asAtFrom);
  if (filters.asAtTo) exportSp.set("to", filters.asAtTo);
  if (params.status) exportSp.set("status", params.status);
  if (filters.productSearch) exportSp.set("q", filters.productSearch);

  return (
    <PageShell
      title="History"
      subtitle="Every count session, searchable and exportable"
      actions={
        <div className="flex gap-2">
          <Link href={`/history/export?${exportSp.toString()}`}>
            <Btn>Export CSV</Btn>
          </Link>
          <Link href={`/history/export-pdf?${exportSp.toString()}`}>
            <Btn>Export PDF</Btn>
          </Link>
        </div>
      }
    >
      <Card title="Count history" extra={`${totalCount} total`}>
        <HistoryFilters
          departments={departments}
          initial={{
            department: params.department ?? "",
            from: params.from ?? "",
            to: params.to ?? "",
            status: params.status ?? "",
            q: params.q ?? "",
          }}
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No sessions match"
            description={totalCount === 0 ? "No counts have been started yet." : "Try different filters."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["As at", "Department", "Counted by", "Products", "Counted", "Variances", "Value", "Status"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 2 && i < 7 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = r.status === "DRAFT" ? `/count/${r.id}` : `/reconcile/${r.id}`;
                  const statusTag = STATUS_TAG[r.status];
                  return (
                    <tr key={r.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-0 h-9">
                        <Link href={href} className="flex items-center h-9 px-4 text-[13.5px] tabular-nums whitespace-nowrap">
                          {r.asAtDate}
                        </Link>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{r.departmentName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{r.countedByName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.productCount}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.countedCount}</td>
                      <td
                        className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                          (r.varianceCount ?? 0) > 0 ? "text-red font-medium" : ""
                        }`}
                      >
                        {r.varianceCount ?? "—"}
                      </td>
                      <td
                        className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                          (r.varianceValue ?? 0) < 0 ? "text-red font-medium" : (r.varianceValue ?? 0) > 0 ? "text-green font-medium" : ""
                        }`}
                      >
                        {signed(r.varianceValue)}
                      </td>
                      <td className="px-4 h-9 whitespace-nowrap">
                        <Tag variant={statusTag.variant}>{statusTag.label}</Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="px-4 py-3 border-t border-n200 flex items-center justify-between text-sm">
            <span className="text-n600">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <PageLink params={params} page={page - 1} disabled={page <= 1}>
                Previous
              </PageLink>
              <PageLink params={params} page={page + 1} disabled={page >= totalPages}>
                Next
              </PageLink>
            </div>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}

function PageLink({ params, page, disabled, children }: { params: SearchParams; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <span className="px-3 py-1.5 rounded border border-n200 text-n400">{children}</span>;
  }
  const sp = new URLSearchParams();
  if (params.department) sp.set("department", params.department);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.status) sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  sp.set("page", String(page));
  return (
    <Link href={`/history?${sp.toString()}`} className="px-3 py-1.5 rounded border border-n200 hover:bg-n50 hover:border-n400">
      {children}
    </Link>
  );
}
