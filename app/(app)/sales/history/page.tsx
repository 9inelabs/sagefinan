import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/AccessDenied";
import { listSalesHistory, type SalesHistoryFilters, type SalesHistoryRow } from "@/lib/sales/actions";
import { SalesHistoryFilters as Filters } from "./SalesHistoryFilters";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

type SearchParams = {
  q?: string;
  department?: string;
  from?: string;
  to?: string;
  page?: string;
};

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
  const [{ rows, totalCount, totalPages }, departments] = await Promise.all([
    listSalesHistory(filters, page),
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
      subtitle="Every posted sale, with overrides and reversals visually distinguished"
      actions={
        <Link href={`/sales/history/export?${exportParams.toString()}`}>
          <Btn>Export CSV</Btn>
        </Link>
      }
    >
      <Card title="Sales history" extra={`${totalCount} total`}>
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

        {rows.length === 0 ? (
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
                    {["Business day", "Department", "Product", "Qty", "Entered by", "Time", "Flags"].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i === 3 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <SalesHistoryDesktopRow key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {rows.map((r) => (
                <SalesHistoryMobileRow key={r.id} row={r} />
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

function SalesHistoryDesktopRow({ row: r }: { row: SalesHistoryRow }) {
  return (
    <tr className={`border-b border-n200 last:border-b-0 hover:bg-n50 ${r.isReversed ? "opacity-60" : ""}`}>
      <td className="px-4 h-9 text-[13.5px] tabular-nums whitespace-nowrap">{r.businessDay}</td>
      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{r.departmentName}</td>
      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
        {r.productName} <span className="text-n600 text-xs">{r.productCode}</span>
      </td>
      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums font-medium whitespace-nowrap">{r.quantity}</td>
      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{r.createdByName}</td>
      <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{formatTime(r.createdAt)}</td>
      <td className="px-4 h-9 whitespace-nowrap">
        <div className="flex gap-1.5">
          {r.isOverride ? <Tag variant="warn">Override</Tag> : null}
          {r.isReversal ? <Tag variant="mut">Reversal</Tag> : null}
          {r.isReversed ? <Tag variant="bad">Reversed</Tag> : null}
        </div>
      </td>
    </tr>
  );
}

function SalesHistoryMobileRow({ row: r }: { row: SalesHistoryRow }) {
  return (
    <div className={`p-4 ${r.isReversed ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{r.productName}</span>
        <span className="text-sm font-medium tabular-nums">{r.quantity}</span>
      </div>
      <div className="text-xs text-n600 mt-0.5">
        {r.productCode} · {r.departmentName}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-n600">
          {r.businessDay} · {formatTime(r.createdAt)} · by {r.createdByName}
        </span>
      </div>
      {r.isOverride || r.isReversal || r.isReversed ? (
        <div className="flex gap-1.5 mt-2">
          {r.isOverride ? <Tag variant="warn">Override</Tag> : null}
          {r.isReversal ? <Tag variant="mut">Reversal</Tag> : null}
          {r.isReversed ? <Tag variant="bad">Reversed</Tag> : null}
        </div>
      ) : null}
    </div>
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
