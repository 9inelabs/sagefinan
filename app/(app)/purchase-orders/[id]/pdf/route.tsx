import { getCurrentProfile } from "@/lib/auth/profile";
import { getPurchaseOrder } from "@/lib/purchase-orders/actions";
import { formatPoNumber } from "@/lib/purchase-orders/format";
import { formatDateTime, formatPoDate } from "@/lib/dates";
import { PurchaseOrderDocument } from "@/lib/pdf/PurchaseOrderDocument";
import { pdfResponse } from "@/lib/pdf/respond";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER" && profile.role !== "AUDITOR") {
    return new Response("Forbidden.", { status: 403 });
  }

  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) return new Response("Not found.", { status: 404 });
  // Only an approved order is an order — a pending/rejected one has no PDF.
  if (po.status !== "APPROVED" && po.status !== "RECEIVED") {
    return new Response("This purchase order hasn't been approved yet.", { status: 409 });
  }

  const poNumber = formatPoNumber(po.poNumber);
  const doc = (
    <PurchaseOrderDocument
      poNumber={poNumber}
      orderDate={formatPoDate(po.orderDate)}
      supplierName={po.supplierName}
      approvedLine={po.approvedAt ? `Approved by ${po.approvedByName ?? "—"} · ${formatDateTime(po.approvedAt)}` : null}
      lines={po.lines.map((l) => ({ lineNo: l.lineNo, description: l.description, quantityText: l.quantityText, amount: l.amount }))}
      total={po.total}
    />
  );

  return pdfResponse(doc, `DeMoon_Purchase_Order_${poNumber}_${formatPoDate(po.orderDate)}.pdf`);
}
