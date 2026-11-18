import { ReceiptLink, ReceiptRow } from "@/components/receipt/ReceiptDrawer";
import { ChevronRight, Download } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Tag } from "@/components/ui/Tag";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportsNav } from "@/components/reports/ReportsNav";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { listPurchaseGroups } from "@/lib/reports/actions";
import { formatNaira } from "@/lib/format";
import { monthStartIso, todayIso } from "@/lib/dates";

const TH = "text-[11px] font-normal text-n600 text-left px-4 pt-1 pb-2 border-b border-n200 whitespace-nowrap";
const TD = "px-4 py-2.5 text-[12.5px] tabular-nums";

export default async function PurchasesReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "AUDITOR" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  const sp = await searchParams;
  const from = sp.from || monthStartIso();
  const to = sp.to || todayIso();
  const groups = await listPurchaseGroups({ from, to, q: sp.q });
  const totalPaid = groups.reduce((s, g) => s + g.amountPaid, 0);
  const totalQty = groups.reduce((s, g) => s + g.quantity, 0);
  const exportQs = new URLSearchParams({ type: "PURCHASE", from, to, ...(sp.q ? { q: sp.q } : {}) }).toString();

  return (
    <PageShell
      title="Purchases"
      subtitle="Goods received into the central store — quantity and amount paid, one receipt per batch"
      actions={
        <a href={`/movements/export?${exportQs}`}>
          <Btn>
            <Download size={14} strokeWidth={1.8} />
            Export CSV
          </Btn>
        </a>
      }
    >
      <ReportsNav active="purchases" role={profile.role} />
      <ReportFilterBar basePath="/reports/purchases" initial={{ from, to, q: sp.q }} searchPlaceholder="Supplier, product or invoice" />

      <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-3 mb-3">
        <Stat variant="hero" label="Amount paid" value={formatNaira(totalPaid)} footer={`${groups.length} receipt${groups.length === 1 ? "" : "s"}`} />
        <Stat label="Bottles into stock" value={String(totalQty)} footer={`${groups.reduce((s, g) => s + g.unstockedItems, 0)} items bought but not stocked`} />
        <Stat label="Average per receipt" value={groups.length ? formatNaira(totalPaid / groups.length) : formatNaira(0)} />
      </div>

      <Card title="Purchase receipts" extra={`${groups.length} in this period`}>
        {groups.length === 0 ? (
          <EmptyState title="No purchases" description="No purchases match these filters." />
        ) : (
          <>
            <div className="overflow-x-auto max-[699px]:hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Business day</th>
                    <th className={TH}>Supplier</th>
                    <th className={TH}>Invoice</th>
                    <th className={`${TH} text-right`}>Items</th>
                    <th className={`${TH} text-right`}>Bottles into stock</th>
                    <th className={`${TH} text-right`}>Not stocked</th>
                    <th className={`${TH} text-right`}>Amount paid</th>
                    <th className={TH}>Entered by</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <ReceiptRow key={g.href} href={g.href} className="border-b border-n200 last:border-b-0 hover:bg-brand-hover">
                      <td className={`${TD} whitespace-nowrap`}>{g.businessDay}</td>
                      <td className={TD}>
                        {g.suppliers.join(", ") || "—"}
                        {g.hasPurchaseOrder ? (
                          <span className="ml-1.5">
                            <Tag variant="acc">PO</Tag>
                          </span>
                        ) : null}
                        {g.hasReversal ? (
                          <span className="ml-1.5">
                            <Tag variant="bad">Has reversal</Tag>
                          </span>
                        ) : null}
                      </td>
                      <td className={`${TD} text-n600`}>{g.invoices.join(", ") || "—"}</td>
                      <td className={`${TD} text-right`}>{g.items}</td>
                      <td className={`${TD} text-right`}>{g.quantity}</td>
                      <td className={`${TD} text-right ${g.unstockedItems ? "" : "text-n400"}`}>{g.unstockedItems || "—"}</td>
                      <td className={`${TD} text-right font-medium`}>{formatNaira(g.amountPaid)}</td>
                      <td className={`${TD} text-n600 whitespace-nowrap`}>{g.createdByName}</td>
                      <td className={`${TD} text-right`}>
                        <ReceiptLink href={g.href} className="inline-flex items-center gap-0.5 text-brand font-medium">
                          Receipt
                          <ChevronRight size={13} strokeWidth={2} />
                        </ReceiptLink>
                      </td>
                    </ReceiptRow>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="min-[700px]:hidden">
              {groups.map((g) => (
                <ReceiptLink key={g.href} href={g.href} className="block border-t border-n200 px-4 py-3 hover:bg-brand-hover">
                  <div className="flex justify-between gap-3">
                    <b className="font-medium text-[12.5px] truncate">{g.suppliers.join(", ") || "Supplier not recorded"}</b>
                    <b className="font-medium text-[12.5px] tabular-nums">{formatNaira(g.amountPaid)}</b>
                  </div>
                  <p className="text-[11px] text-n600 mt-0.5">
                    {g.businessDay} · {g.items} item{g.items === 1 ? "" : "s"} · {g.quantity} bottles
                    {g.unstockedItems ? ` · ${g.unstockedItems} not stocked` : ""}
                  </p>
                </ReceiptLink>
              ))}
            </div>
          </>
        )}
      </Card>
    </PageShell>
  );
}
