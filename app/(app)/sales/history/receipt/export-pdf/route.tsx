import { getCurrentProfile } from "@/lib/auth/profile";
import { getSalesReceiptDetail } from "@/lib/sales/actions";
import { ReceiptDocument } from "@/lib/pdf/ReceiptDocument";
import { pdfResponse } from "@/lib/pdf/respond";

export async function GET(request: Request) {
  await getCurrentProfile();

  const url = new URL(request.url);
  const department = url.searchParams.get("department");
  const day = url.searchParams.get("day");
  const by = url.searchParams.get("by");
  if (!department || !day || !by) return new Response("Missing department, day, or by.", { status: 400 });

  const detail = await getSalesReceiptDetail(department, day, by);
  if (!detail) return new Response("Not found.", { status: 404 });

  const doc = (
    <ReceiptDocument
      kind="Sales entry"
      businessDay={detail.businessDay}
      departmentName={detail.departmentName}
      createdByName={detail.createdByName}
      lines={detail.lines.map((l) => ({
        code: l.productCode,
        name: l.productName,
        quantity: l.quantity,
        isOverride: l.isOverride,
        isReversal: l.isReversal,
        isReversed: l.isReversed,
      }))}
    />
  );

  return pdfResponse(doc, `sales-receipt-${detail.departmentName.toLowerCase().replace(/\s+/g, "-")}-${day}.pdf`);
}
