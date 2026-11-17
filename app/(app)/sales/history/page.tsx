import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/AccessDenied";
import { listSalesHistoryGroups, type SalesHistoryFilters, type SalesHistoryGroup } from "@/lib/sales/actions";
import { SalesHistoryFilters as Filters } from "./SalesHistoryFilters";

type SearchParams = {
  q?: string;
  department?: string;
  from?: string;
  to?: string;
  page?: string;
};

function receiptHref(g: SalesHistoryGroup) {
  const sp = new URLSearchParams({ department: g.departmentId, day: g.businessDay, by: g.createdBy });
  return `/sales/history/receipt?${sp.toString()}`;
}

export default async function SalesHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "AUDITOR" && profile.role !== "STOREKEEPER" && profile.role !== "DEPARTMENT_USER") {
    return <AccessDenied />;
  }

  const params = await searchParams;
  const filters: SalesHistoryFilters = {
    q: params.q,
    departmentId: params.department,
    businessDayFrom: params.from,
    businessDayTo: params.to,
  };
  const page = Math.max(1, Number(params.page) || 1);

  const canSeeEverything = profile.role === "ADMIN" || profile.role === "AUDITOR" || profile.role === "STOREKEEPER";

  const admin = createAdminClient();
  const [{ groups, totalCount, totalPages }, departments] = await Promise.all([
    listSalesHistoryGroups(filters, page),
    canSeeEverything
      ? admin
          .from("departments")
          .select("id, name")
          .eq("is_active", true)
          .eq("is_central_store", false)
          .order("name")
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const exportParams = new URLSearchParams();
  if (params.q) exportParams.set("q", params.q);
  if (params.department) exportParams.set("department", params.department);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);

  return (
    <PageShell
      title="Sales history"
      subtitle="One line per day's sales for a department — open a line for the full receipt"
      actions={
        <Link href={`/sales/history/export?${exportParams.toString()}`}>
          <Btn>Export CSV</Btn>
        </Link>
      }
    >
      <Card title="Sales history" extra={`${totalCount} batch${totalCount === 1 ? "" : "es"}`}>
        <Filters
          departments={departments}
          showDepartmentFilter={canSeeEverything}
          initial={{
            q: params.q ?? "",
            department: params.department ?? "",
            from: params.from ?? "",
            to: params.to ?? "",
          }}
        />

        {groups.length === 0 ? (
          <EmptyState
            title="No sales match"
            description={totalCount === 0 && !params.q ? "Nothing has been posted yet." : "Try a different search term or clear the filters."}
          />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Business day", "Department", "Entered by", "Items", "Total qty", "Flags"].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap ${
                          i === 3 || i === 4 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <SalesHistoryDesktopRow key={`${g.businessDay}:${g.departmentId}:${g.createdBy}`} group={g} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {groups.map((g) => (
                <SalesHistoryMobileRow key={`${g.businessDay}:${g.departmentId}:${g.createdBy}`} group={g} />
              ))}
            </div>
          </>
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

function SalesHistoryDesktopRow({ group: g }: { group: SalesHistoryGroup }) {
  return (
    <tr className="border-b border-n200 last:border-b-0 hover:bg-n50">
      <td className="px-0 h-9">
        <Link href={receiptHref(g)} className="flex items-center h-9 px-4 text-[12.5px] tabular-nums whitespace-nowrap text-brand">
          {g.businessDay}
        </Link>
      </td>
      <td className="px-4 h-9 text-[12.5px] whitespace-nowrap">{g.departmentName}</td>
      <td className="px-4 h-9 text-[12.5px] text-n600 whitespace-nowrap">{g.createdByName}</td>
      <td className="px-4 h-9 text-[12.5px] text-right tabular-nums whitespace-nowrap">{g.lineCount}</td>
      <td className="px-4 h-9 text-[12.5px] text-right tabular-nums font-medium whitespace-nowrap">{g.totalQuantity}</td>
      <td className="px-4 h-9 whitespace-nowrap">
        <div className="flex gap-1.5">
          {g.hasOverride ? <Tag variant="warn">Override</Tag> : null}
          {g.hasReversal ? <Tag variant="mut">Reversal</Tag> : null}
        </div>
      </td>
    </tr>
  );
}

function SalesHistoryMobileRow({ group: g }: { group: SalesHistoryGroup }) {
  return (
    <Link href={receiptHref(g)} className="block p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{g.departmentName}</span>
        <span className="text-sm font-medium tabular-nums">{g.totalQuantity}</span>
      </div>
      <div className="text-xs text-n600 mt-0.5 tabular-nums">
        {g.businessDay} · {g.lineCount} item{g.lineCount === 1 ? "" : "s"} · by {g.createdByName}
      </div>
      {g.hasOverride || g.hasReversal ? (
        <div className="flex gap-1.5 mt-2">
          {g.hasOverride ? <Tag variant="warn">Override</Tag> : null}
          {g.hasReversal ? <Tag variant="mut">Reversal</Tag> : null}
        </div>
      ) : null}
    </Link>
  );
}

function PageLink({ params, page, disabled, children }: { params: SearchParams; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <span className="px-3 py-1.5 rounded border border-n200 text-n400">{children}</span>;
  }
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.department) sp.set("department", params.department);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  sp.set("page", String(page));
  return (
    <Link href={`/sales/history?${sp.toString()}`} className="px-3 py-1.5 rounded border border-n200 hover:bg-n50 hover:border-n400">
      {children}
    </Link>
  );
}
