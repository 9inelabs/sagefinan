import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { listLedgerDepartments, getLedgerData } from "@/lib/ledger/actions";
import { formatNaira } from "@/lib/format";
import { todayIso } from "@/lib/dates";
import { LedgerFilters } from "./LedgerFilters";

type SearchParams = { department?: string; date?: string; q?: string; hasMovement?: string };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  const params = await searchParams;

  const departments = await listLedgerDepartments();
  if (departments.length === 0) {
    return (
      <PageShell title="Stock ledger" subtitle="Opening, movements and closing as at a given date">
        <Card title="Stock ledger">
          <EmptyState
            title="No department to show"
            description={
              profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER"
                ? "You aren't assigned to an active department yet."
                : "Add a department before the ledger can populate."
            }
          />
        </Card>
      </PageShell>
    );
  }

  const departmentId = departments.find((d) => d.id === params.department)?.id ?? departments[0].id;
  const asAtDate = params.date || todayIso();
  const showDepartmentPicker = departments.length > 1;

  const data = await getLedgerData({
    departmentId,
    asAtDate,
    search: params.q,
    hasMovementOnly: params.hasMovement === "1",
  });

  const receivedLabel = data.department.isCentralStore ? "Purchases" : "Received";
  const issuedLabel = data.department.isCentralStore ? "Requisitions out" : "Sales";

  const exportSp = new URLSearchParams();
  exportSp.set("department", departmentId);
  exportSp.set("date", asAtDate);
  if (params.q) exportSp.set("q", params.q);
  if (params.hasMovement) exportSp.set("hasMovement", params.hasMovement);

  return (
    <PageShell
      title="Stock ledger"
      subtitle={`${data.department.name} · opening, movements and closing as at ${asAtDate}`}
      actions={
        <div className="flex gap-2">
          <Link href={`/ledger/export?${exportSp.toString()}`}>
            <Btn>Export CSV</Btn>
          </Link>
          <Link href={`/ledger/export-pdf?${exportSp.toString()}`}>
            <Btn>Export PDF</Btn>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-4.5">
        <Stat label="Opening value" value={formatNaira(data.rows.reduce((s, r) => s + r.openingQty * r.unitCost, 0))} />
        <Stat
          label={receivedLabel}
          value={"+" + formatNaira(data.rows.reduce((s, r) => s + r.receivedQty * r.unitCost, 0))}
          colorClassName="text-green"
        />
        <Stat
          label={issuedLabel}
          value={"−" + formatNaira(data.rows.reduce((s, r) => s + r.issuedQty * r.unitCost, 0))}
          colorClassName="text-red"
        />
        <Stat label="Closing value" value={formatNaira(data.totalClosingValue)} />
      </div>

      <Card title={`Stock ledger — ${data.department.name}`} extra={`as at ${asAtDate}`}>
        <LedgerFilters
          departments={departments}
          showDepartmentPicker={showDepartmentPicker}
          initial={{ department: departmentId, date: asAtDate, q: params.q ?? "", hasMovement: params.hasMovement === "1" }}
        />

        {data.rows.length === 0 ? (
          <EmptyState
            title="No products match"
            description={data.totalCount === 0 ? "No products are assigned to this department yet." : "Try a different search term or clear the filters."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Product", "Opening", receivedLabel, issuedLabel, "Closing", "Unit cost", "Closing value"].map((h, i) => (
                    <th
                      key={h + i}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 0 ? "text-right" : "sticky left-0 z-1"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.productId} className="border-b border-n200 last:border-b-0 hover:bg-n50 group">
                    <td className="px-0 h-9 sticky left-0 z-1 bg-white group-hover:bg-n50">
                      <Link
                        href={`/ledger/${r.productId}?${exportSp.toString()}`}
                        className="flex items-center h-9 px-4 text-[13.5px] whitespace-nowrap"
                      >
                        {r.name} <span className="text-n600 text-xs ml-1.5">{r.code}</span>
                      </Link>
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{r.openingQty}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-green tabular-nums whitespace-nowrap">
                      {r.receivedQty !== 0 ? `+${r.receivedQty}` : 0}
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-red tabular-nums whitespace-nowrap">
                      {r.issuedQty !== 0 ? `−${r.issuedQty}` : 0}
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap">{r.closingQty}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{formatNaira(r.unitCost)}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(r.closingValue)}</td>
                  </tr>
                ))}
                <tr className="bg-n50">
                  <td className="px-4 h-9 text-[13.5px] font-medium sticky left-0 z-1 bg-n50 whitespace-nowrap">Total</td>
                  <td className="px-4 h-9" />
                  <td className="px-4 h-9" />
                  <td className="px-4 h-9" />
                  <td className="px-4 h-9" />
                  <td className="px-4 h-9" />
                  <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">
                    {formatNaira(data.totalClosingValue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-n200 flex justify-between items-center text-sm text-n600">
          <span>
            Showing {data.shownCount} of {data.totalCount} products
          </span>
          <span>Click any row to see every movement behind these figures.</span>
        </div>
      </Card>

      <div className="note text-xs text-n600 bg-n50 border border-n200 rounded p-3 mt-4">
        {data.department.isCentralStore
          ? "The central store reads Opening / Purchases / Requisitions out / Closing — same structure as every other department, different movement types."
          : "This department reads Opening / Received / Sales / Closing. The central store's own ledger reads Purchases and Requisitions out instead, in the same columns."}
      </div>
    </PageShell>
  );
}
