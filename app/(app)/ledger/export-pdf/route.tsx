import { getCurrentProfile } from "@/lib/auth/profile";
import { getLedgerData } from "@/lib/ledger/actions";
import { ReportDocument, PdfTable, type PdfColumn } from "@/lib/pdf/ReportDocument";
import { formatNairaPdf } from "@/lib/pdf/theme";
import { pdfResponse } from "@/lib/pdf/respond";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department");
  const date = url.searchParams.get("date");
  if (!departmentId || !date) return new Response("Missing department or date.", { status: 400 });

  const data = await getLedgerData({
    departmentId,
    asAtDate: date,
    search: url.searchParams.get("q") ?? undefined,
    hasMovementOnly: url.searchParams.get("hasMovement") === "1",
  });

  const receivedLabel = data.department.isCentralStore ? "Purchases" : "Received";
  const issuedLabel = data.department.isCentralStore ? "Requisitions out" : "Sales";

  const columns: PdfColumn[] = [
    { header: "Product", width: 30 },
    { header: "Opening", width: 10, align: "right" },
    { header: receivedLabel, width: 12, align: "right" },
    { header: issuedLabel, width: 14, align: "right" },
    { header: "Closing", width: 10, align: "right" },
    { header: "Unit cost", width: 12, align: "right" },
    { header: "Closing value", width: 12, align: "right" },
  ];

  const rows = data.rows.map((r) => [
    `${r.name} (${r.code})`,
    String(r.openingQty),
    r.receivedQty !== 0 ? `+${r.receivedQty}` : "0",
    r.issuedQty !== 0 ? `−${r.issuedQty}` : "0",
    String(r.closingQty),
    formatNairaPdf(r.unitCost),
    formatNairaPdf(r.closingValue),
  ]);

  const totalsRow = ["Total", "", "", "", "", "", formatNairaPdf(data.totalClosingValue)];

  const doc = (
    <ReportDocument
      title="Stock ledger"
      scopeLine={`${data.department.name} · as at ${date} · ${data.shownCount} of ${data.totalCount} products`}
      generatedByName={profile.fullName}
      generatedAt={new Date().toISOString()}
    >
      <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} />
    </ReportDocument>
  );

  return pdfResponse(doc, `ledger-${data.department.name.toLowerCase().replace(/\s+/g, "-")}-${date}.pdf`);
}
