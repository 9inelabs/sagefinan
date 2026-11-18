import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatNaira } from "@/lib/format";
import { formatPoDate } from "@/lib/dates";
import { formatPoNumber, PO_STATUS_META } from "@/lib/purchase-orders/format";
import type { PurchaseOrderSummary } from "@/lib/purchase-orders/actions";

const TH = "text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap";
const TD = "px-4 py-2.5 text-[12.5px] whitespace-nowrap tabular-nums";

// Shared by /purchase-orders and the Reports → Purchase orders tab.
export function PurchaseOrderList({ orders, emptyText }: { orders: PurchaseOrderSummary[]; emptyText: string }) {
  return (
    <Card title="Orders" extra={`${orders.length} order${orders.length === 1 ? "" : "s"}`}>
      {orders.length === 0 ? (
        <EmptyState title="Nothing here" description={emptyText} />
      ) : (
        <>
          <div className="overflow-x-auto max-[699px]:hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Order</th>
                  <th className={TH}>Date</th>
                  <th className={TH}>Supplier</th>
                  <th className={`${TH} text-right`}>Items</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={TH}>Raised by</th>
                  <th className={TH}>Status</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const meta = PO_STATUS_META[o.status];
                  return (
                    <tr key={o.id} className="border-b border-n200 last:border-b-0 hover:bg-brand-hover">
                      <td className={`${TD} font-medium`}>
                        <Link href={`/purchase-orders/${o.id}`}>{formatPoNumber(o.poNumber)}</Link>
                      </td>
                      <td className={TD}>{formatPoDate(o.orderDate)}</td>
                      <td className={`${TD} text-n600`}>{o.supplierName ?? "—"}</td>
                      <td className={`${TD} text-right`}>{o.lineCount}</td>
                      <td className={`${TD} text-right font-medium`}>{formatNaira(o.total)}</td>
                      <td className={`${TD} text-n600`}>{o.createdByName}</td>
                      <td className={TD}>
                        <Tag variant={meta.variant}>{meta.label}</Tag>
                      </td>
                      <td className={`${TD} text-right`}>
                        <Link href={`/purchase-orders/${o.id}`} className="inline-flex items-center gap-0.5 text-brand font-medium">
                          Open
                          <ChevronRight size={13} strokeWidth={2} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="min-[700px]:hidden">
            {orders.map((o) => {
              const meta = PO_STATUS_META[o.status];
              return (
                <Link key={o.id} href={`/purchase-orders/${o.id}`} className="block border-t border-n200 px-4 py-3 hover:bg-brand-hover">
                  <div className="flex items-center justify-between gap-3">
                    <b className="font-medium text-[13px]">{formatPoNumber(o.poNumber)}</b>
                    <Tag variant={meta.variant}>{meta.label}</Tag>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1 text-[11.5px] text-n600">
                    <span className="truncate">
                      {formatPoDate(o.orderDate)} · {o.lineCount} item{o.lineCount === 1 ? "" : "s"}
                      {o.supplierName ? ` · ${o.supplierName}` : ""}
                    </span>
                    <span className="text-ink font-medium tabular-nums">{formatNaira(o.total)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
