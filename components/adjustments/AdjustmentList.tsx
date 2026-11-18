import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatNaira } from "@/lib/format";
import { adjustmentCategoryLabel } from "@/lib/movements/labels";
import type { AdjustmentRow } from "@/lib/adjustments/actions";

const TH = "text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap";
const TD = "px-4 py-2.5 text-[12.5px] tabular-nums";

export function adjustmentReceiptHref(r: Pick<AdjustmentRow, "businessDay" | "departmentId" | "createdBy">) {
  return `/reports/receipt?kind=ADJUSTMENT&department=${r.departmentId}&day=${r.businessDay}&by=${r.createdBy}`;
}

// Shared by /adjustments (recent) and Reports → Adjustments (filtered).
export function AdjustmentList({ rows, title, extra }: { rows: AdjustmentRow[]; title: string; extra?: string }) {
  return (
    <Card title={title} extra={extra}>
      {rows.length === 0 ? (
        <EmptyState title="No adjustments" description="Stock adjustments appear here once recorded." />
      ) : (
        <>
          <div className="overflow-x-auto max-[699px]:hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Business day</th>
                  <th className={TH}>Department</th>
                  <th className={TH}>Product</th>
                  <th className={`${TH} text-right`}>Change</th>
                  <th className={`${TH} text-right`}>Value at cost</th>
                  <th className={TH}>Reason</th>
                  <th className={TH}>By</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-n200 last:border-b-0 hover:bg-brand-hover align-top">
                    <td className={`${TD} whitespace-nowrap`}>{r.businessDay}</td>
                    <td className={`${TD} whitespace-nowrap`}>{r.departmentName}</td>
                    <td className={TD}>
                      <b className="font-medium block">{r.productName}</b>
                      <span className="text-[11px] text-n600">{r.productCode}</span>
                    </td>
                    <td className={`${TD} text-right font-medium whitespace-nowrap ${r.delta < 0 ? "text-red" : "text-green"}`}>
                      {r.delta > 0 ? `+${r.delta}` : `−${Math.abs(r.delta)}`}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>{formatNaira(r.value)}</td>
                    <td className={TD}>
                      <span className="whitespace-nowrap">{adjustmentCategoryLabel(r.category)}</span>
                      {r.isReversal ? <Tag variant="mut">Reversal</Tag> : null}
                      {r.isReversed ? <Tag variant="bad">Reversed</Tag> : null}
                      {r.note ? <span className="block text-[11px] text-n600 max-w-[260px]">{r.note}</span> : null}
                    </td>
                    <td className={`${TD} text-n600 whitespace-nowrap`}>{r.createdByName}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <Link href={adjustmentReceiptHref(r)} className="inline-flex items-center gap-0.5 text-brand font-medium">
                        Receipt
                        <ChevronRight size={13} strokeWidth={2} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="min-[700px]:hidden">
            {rows.map((r) => (
              <Link key={r.id} href={adjustmentReceiptHref(r)} className="block border-t border-n200 px-4 py-3 hover:bg-brand-hover">
                <div className="flex items-center justify-between gap-3">
                  <b className="font-medium text-[12.5px] truncate">{r.productName}</b>
                  <span className={`font-medium tabular-nums ${r.delta < 0 ? "text-red" : "text-green"}`}>
                    {r.delta > 0 ? `+${r.delta}` : `−${Math.abs(r.delta)}`}
                  </span>
                </div>
                <p className="text-[11px] text-n600 mt-0.5">
                  {r.departmentName} · {r.businessDay} · {adjustmentCategoryLabel(r.category)}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
