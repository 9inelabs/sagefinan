import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOverrideCount, listMovements, type MovementFilters, type MovementRow, type MovementType } from "@/lib/movements/actions";
import { MovementsFilters } from "./MovementsFilters";

const TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE: "Purchase",
  REQUISITION: "Requisition",
  SALE: "Sale",
  OPENING: "Opening balance",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function route(row: MovementRow) {
  if (row.type === "PURCHASE" || row.type === "OPENING") return row.toDepartmentName ?? "—";
  if (row.type === "SALE") return row.fromDepartmentName ?? "—";
  return `${row.fromDepartmentName ?? "—"} → ${row.toDepartmentName ?? "—"}`;
}

type SearchParams = {
  q?: string;
  type?: string;
  department?: string;
  from?: string;
  to?: string;
  override?: string;
  page?: string;
};

export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  const params = await searchParams;

  const filters: MovementFilters = {
    q: params.q,
    type: params.type as MovementType | undefined,
    departmentId: params.department,
    businessDayFrom: params.from,
    businessDayTo: params.to,
    overrideOnly: params.override === "1",
  };
  const page = Math.max(1, Number(params.page) || 1);

  const canSeeEverything = profile.role === "ADMIN" || profile.role === "AUDITOR";

  const admin = createAdminClient();
  const [{ rows, totalCount, totalPages }, departments, overrideCount] = await Promise.all([
    listMovements(filters, page),
    canSeeEverything
      ? admin.from("departments").select("id, name").eq("is_active", true).order("name").then((r) => r.data ?? [])
      : Promise.resolve([]),
    canSeeEverything ? getOverrideCount() : Promise.resolve(null),
  ]);

  const exportParams = new URLSearchParams();
  if (params.q) exportParams.set("q", params.q);
  if (params.type) exportParams.set("type", params.type);
  if (params.department) exportParams.set("department", params.department);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);
  if (params.override) exportParams.set("override", params.override);

  return (
    <PageShell
      title="Movements"
      subtitle="Every purchase, requisition and sale, with reversals traceable in both directions"
      actions={
        <Link href={`/movements/export?${exportParams.toString()}`}>
          <Btn>Export CSV</Btn>
        </Link>
      }
    >
      {overrideCount !== null ? (
        <div className="mb-4.5 max-w-[280px]">
          <Link href="/movements?override=1">
            <Stat label="Flagged for review" value={String(overrideCount)} hint="override movements" colorClassName={overrideCount > 0 ? "text-amber" : undefined} />
          </Link>
        </div>
      ) : null}

      <Card title="Movements" extra={`${totalCount} total`}>
        <MovementsFilters
          departments={departments}
          showDepartmentFilter={canSeeEverything}
          initial={{
            q: params.q ?? "",
            type: params.type ?? "",
            department: params.department ?? "",
            from: params.from ?? "",
            to: params.to ?? "",
            override: params.override === "1",
          }}
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No movements match"
            description={totalCount === 0 && !params.q && !params.type ? "Nothing has been posted yet." : "Try a different search term or clear the filters."}
          />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Business day", "Time", "Type", "Product", "Route", "Qty", "Entered by", "Received by", "Flags"].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i === 5 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className={`border-b border-n200 last:border-b-0 hover:bg-n50 ${m.isReversed ? "opacity-60" : ""}`}>
                      <td className="px-0 h-9">
                        <Link href={`/movements/${m.id}`} className="flex items-center h-9 px-4 text-[13.5px] tabular-nums whitespace-nowrap">
                          {m.businessDay}
                        </Link>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{formatTime(m.createdAt)}</td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{TYPE_LABEL[m.type]}</td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        {m.productName} <span className="text-n600 text-xs">{m.productCode}</span>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{route(m)}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums font-medium whitespace-nowrap">{m.quantity}</td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{m.createdByName}</td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{m.receivedByName ?? "—"}</td>
                      <td className="px-4 h-9 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {m.isOverride ? <Tag variant="warn">Override</Tag> : null}
                          {m.isReversal ? <Tag variant="mut">Reversal</Tag> : null}
                          {m.isReversed ? <Tag variant="bad">Reversed</Tag> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {rows.map((m) => (
                <Link
                  key={m.id}
                  href={`/movements/${m.id}`}
                  className={`block p-4 ${m.isReversed ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{TYPE_LABEL[m.type]}</span>
                    <span className="text-xs text-n600 tabular-nums">
                      {m.businessDay} · {formatTime(m.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm mt-1">
                    {m.productName} <span className="text-n600 text-xs">{m.productCode}</span>
                  </div>
                  <div className="text-xs text-n600 mt-0.5">{route(m)}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-n600">by {m.createdByName}</span>
                    <span className="text-sm font-medium tabular-nums">{m.quantity}</span>
                  </div>
                  {m.isOverride || m.isReversal || m.isReversed ? (
                    <div className="flex gap-1.5 mt-2">
                      {m.isOverride ? <Tag variant="warn">Override</Tag> : null}
                      {m.isReversal ? <Tag variant="mut">Reversal</Tag> : null}
                      {m.isReversed ? <Tag variant="bad">Reversed</Tag> : null}
                    </div>
                  ) : null}
                </Link>
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

function PageLink({ params, page, disabled, children }: { params: SearchParams; page: number; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return <span className="px-3 py-1.5 rounded border border-n200 text-n400">{children}</span>;
  }
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.type) sp.set("type", params.type);
  if (params.department) sp.set("department", params.department);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.override) sp.set("override", params.override);
  sp.set("page", String(page));
  return (
    <Link href={`/movements?${sp.toString()}`} className="px-3 py-1.5 rounded border border-n200 hover:bg-n50 hover:border-n400">
      {children}
    </Link>
  );
}
