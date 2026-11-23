import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Download, FileText, PackageCheck, Pencil, XCircle } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Tag } from "@/components/ui/Tag";
import { getPurchaseOrder } from "@/lib/purchase-orders/actions";
import { formatPoNumber, PO_STATUS_META } from "@/lib/purchase-orders/format";
import { formatNaira } from "@/lib/format";
import { formatDateTime, formatPoDate } from "@/lib/dates";
import { PurchaseOrderActions } from "./PurchaseOrderActions";
import { ReceiptLink } from "@/components/receipt/ReceiptDrawer";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER" && profile.role !== "AUDITOR") return <AccessDenied />;

  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const meta = PO_STATUS_META[po.status];
  const canDownload = po.status === "APPROVED" || po.status === "RECEIVED";
  // Everything but a received order can be edited (an approved one too — see
  // save_purchase_order for how approval is kept or reset).
  const canEdit = po.status !== "RECEIVED" && profile.role !== "AUDITOR";
  const canReceive = po.status === "APPROVED" && (profile.role === "ADMIN" || profile.role === "STOREKEEPER");
  const linked = po.lines.filter((l) => l.productId).length;

  const pill =
    "inline-flex items-center gap-1.5 h-9.5 px-4 rounded-full text-[12.5px] font-medium transition-[transform,filter,background-color] active:scale-[0.97]";

  return (
    <PageShell
      title={formatPoNumber(po.poNumber)}
      subtitle={`Purchase order · ${formatPoDate(po.orderDate)}${po.supplierName ? ` · ${po.supplierName}` : ""}`}
      actions={
        <>
          <Link href="/purchase-orders" className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover`}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            All orders
          </Link>
          {canEdit ? (
            <Link href={`/purchase-orders/${po.id}/edit`} className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover`}>
              <Pencil size={14} strokeWidth={1.8} />
              Edit
            </Link>
          ) : null}
          {canDownload ? (
            <a href={`/purchase-orders/${po.id}/pdf`} className={`${pill} bg-ink text-white shadow-btn hover:bg-frame`}>
              <Download size={15} strokeWidth={1.9} className="text-brand-bright" />
              Download PDF
            </a>
          ) : null}
        </>
      }
    >
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
        <div className="grid grid-cols-1 gap-3 min-w-0">
          <section className="surface-hero rounded-premium p-5 min-[900px]:p-6 animate-rise">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11.5px] text-on-dark-mut">De-Moon Relaxation Place · Goods purchase order</p>
                <p className="mt-1 text-[28px] min-[900px]:text-[34px] font-normal tracking-[-0.035em] leading-tight tabular-nums">
                  {formatNaira(po.total)}
                </p>
                <p className="mt-1 text-[12px] text-on-dark-2">
                  {po.lineCount} item{po.lineCount === 1 ? "" : "s"} · {linked} linked to stock
                  {po.unpricedCount > 0 ? <span className="text-amber-soft"> · {po.unpricedCount} not priced yet</span> : null}
                </p>
              </div>
              <Tag variant={meta.variant}>{meta.label}</Tag>
            </div>
            <dl className="mt-5 grid grid-cols-2 min-[700px]:grid-cols-4 gap-2">
              <Meta label="Order date" value={formatPoDate(po.orderDate)} />
              <Meta label="Supplier" value={po.supplierName ?? "—"} />
              <Meta label="Raised by" value={po.createdByName} />
              <Meta label="Order no." value={formatPoNumber(po.poNumber)} />
            </dl>
            {po.notes ? <p className="mt-4 text-[12px] text-on-dark-2 rounded-[12px] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] px-3.5 py-2.5">“{po.notes}”</p> : null}
          </section>

          <section className="bg-white rounded-premium shadow-premium overflow-hidden animate-rise [animation-delay:60ms]">
            <div className="px-5 pt-5 pb-2 flex items-center justify-between">
              <h2 className="text-[14px] font-medium">Items</h2>
              <span className="text-[11.5px] text-n600">{po.lineCount} lines</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-[11px] text-n600">
                    <th className="font-normal text-right pl-5 pr-2 pb-2 border-b border-n200 w-10">#</th>
                    <th className="font-normal text-left px-3 pb-2 border-b border-n200">Description</th>
                    <th className="font-normal text-left px-3 pb-2 border-b border-n200">Qty</th>
                    <th className="font-normal text-right pl-3 pr-5 pb-2 border-b border-n200">Total price</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => (
                    <tr key={l.lineNo} className="border-b border-n100 last:border-b-0 hover:bg-brand-hover">
                      <td className="text-right pl-5 pr-2 py-2.5 text-[11.5px] text-n600 tabular-nums align-top">{l.lineNo}</td>
                      <td className="px-3 py-2.5 text-[12.5px]">
                        {l.description}
                        {l.productId ? (
                          <span className="ml-2 text-[10.5px] text-brand bg-brand-soft rounded-sm px-1.5 py-0.5 whitespace-nowrap">
                            stock · {l.productCode}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] font-medium whitespace-nowrap">{l.quantityText ?? ""}</td>
                      <td className="pl-3 pr-5 py-2.5 text-[12.5px] font-medium text-right tabular-nums whitespace-nowrap">
                        {l.amount == null ? <span className="text-amber font-normal">Not priced</span> : formatNaira(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-n50">
                    <td colSpan={3} className="text-right px-3 py-3 text-[12px] text-n600">
                      Subtotal
                    </td>
                    <td className="pl-3 pr-5 py-3 text-right text-[15px] font-medium tabular-nums">{formatNaira(po.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>

        <aside className="grid grid-cols-1 gap-3 min-[1100px]:sticky min-[1100px]:top-4">
          <PurchaseOrderActions
            id={po.id}
            status={po.status}
            role={profile.role}
            canReceive={canReceive}
            linkedLines={linked}
            unpricedCount={po.unpricedCount}
          />

          <section className="bg-white rounded-premium shadow-premium p-5 animate-rise [animation-delay:120ms]">
            <h2 className="text-[14px] font-medium mb-3">Timeline</h2>
            <ol className="relative border-l border-n200 ml-2 space-y-4">
              <TimelineItem icon={<FileText size={13} strokeWidth={2} />} title="Raised" detail={`${po.createdByName} · ${formatDateTime(po.createdAt)}`} />
              {po.status === "PENDING" ? (
                <TimelineItem icon={<Clock size={13} strokeWidth={2} />} title="Waiting for approval" detail="An admin needs to approve or reject it" tone="amber" />
              ) : null}
              {po.rejectedAt ? (
                <TimelineItem
                  icon={<XCircle size={13} strokeWidth={2} />}
                  title="Rejected"
                  detail={`${po.rejectedByName ?? "—"} · ${formatDateTime(po.rejectedAt)}${po.rejectionReason ? ` — “${po.rejectionReason}”` : ""}`}
                  tone="red"
                />
              ) : null}
              {po.approvedAt ? (
                <TimelineItem icon={<CheckCircle2 size={13} strokeWidth={2} />} title="Approved" detail={`${po.approvedByName ?? "—"} · ${formatDateTime(po.approvedAt)}`} />
              ) : null}
              {po.amendedAt && po.status !== "PENDING" && po.status !== "REJECTED" ? (
                <TimelineItem
                  icon={<Pencil size={13} strokeWidth={2} />}
                  title="Edited after approval"
                  detail={`${po.amendedByName ?? "—"} · ${formatDateTime(po.amendedAt)}`}
                  tone="amber"
                />
              ) : null}
              {po.receivedAt ? (
                <TimelineItem
                  icon={<PackageCheck size={13} strokeWidth={2} />}
                  title="Received into stock"
                  detail={formatDateTime(po.receivedAt)}
                  link={
                    po.receipt
                      ? {
                          href: `/reports/receipt?kind=PURCHASE&day=${po.receipt.businessDay}&by=${po.receipt.createdBy}&po=${po.id}`,
                          label: "View goods-received receipt →",
                        }
                      : undefined
                  }
                />
              ) : null}
            </ol>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] px-3 py-2 min-w-0">
      <dt className="text-[10.5px] text-on-dark-mut">{label}</dt>
      <dd className="text-[12.5px] text-on-dark truncate">{value}</dd>
    </div>
  );
}

function TimelineItem({
  icon,
  title,
  detail,
  tone = "brand",
  link,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: "brand" | "amber" | "red";
  link?: { href: string; label: string };
}) {
  const toneClass = tone === "amber" ? "bg-amber-soft text-amber" : tone === "red" ? "bg-red-soft text-red" : "bg-brand-soft text-brand";
  return (
    <li className="pl-5 relative">
      <span className={`absolute -left-[13px] top-0 w-6 h-6 rounded-full grid place-items-center ring-4 ring-white ${toneClass}`}>{icon}</span>
      <p className="text-[12.5px] font-medium">{title}</p>
      <p className="text-[11.5px] text-n600 mt-0.5">{detail}</p>
      {link ? (
        <ReceiptLink href={link.href} className="text-[11.5px] text-brand font-medium mt-1 inline-block">
          {link.label}
        </ReceiptLink>
      ) : null}
    </li>
  );
}
