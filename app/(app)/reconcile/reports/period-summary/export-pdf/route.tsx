import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getPeriodSummary } from "@/lib/reconcile/actions";
import { ReportDocument, PdfTable, PdfNote, type PdfColumn } from "@/lib/pdf/ReportDocument";
import { formatNairaPdf, signedNairaPdf, signedQtyPdf } from "@/lib/pdf/theme";
import { pdfResponse } from "@/lib/pdf/respond";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!departmentId || !from || !to) return new Response("Missing department or date range.", { status: 400 });

  const summary = await getPeriodSummary({ departmentId, from, to });
  const receivedLabel = summary.isCentralStore ? "Purchases" : "Received";
  const issuedLabel = summary.isCentralStore ? "Requisitions out" : "Issued";

  const summaryColumns: PdfColumn[] = [
    { header: "Opening", width: 20, align: "right" },
    { header: receivedLabel, width: 20, align: "right" },
    { header: issuedLabel, width: 20, align: "right" },
    { header: "Closing", width: 20, align: "right" },
    { header: "Variance", width: 20, align: "right" },
  ];
  const summaryRow = [
    formatNairaPdf(summary.openingValue),
    "+" + formatNairaPdf(summary.receivedValue),
    "−" + formatNairaPdf(summary.issuedValue),
    formatNairaPdf(summary.closingValue),
    signedNairaPdf(summary.varianceValue),
  ];

  const reasonColumns: PdfColumn[] = [
    { header: "Reason", width: 40 },
    { header: "Lines", width: 20, align: "right" },
    { header: "Quantity", width: 20, align: "right" },
    { header: "Value", width: 20, align: "right" },
  ];
  const varianceRows = summary.varianceRows.map((r) => [r.label, String(r.lineCount), signedQtyPdf(r.totalQuantity), formatNairaPdf(r.totalValue ?? 0)]);

  const bookDiffColumns: PdfColumn[] = [
    { header: "Reason", width: 50 },
    { header: "Lines", width: 25, align: "right" },
    { header: "Quantity", width: 25, align: "right" },
  ];
  const bookDiffRows = summary.bookDiffRows.map((r) => [r.label, String(r.lineCount), signedQtyPdf(r.totalQuantity)]);

  const doc = (
    <ReportDocument
      title="Period summary"
      scopeLine={`${summary.departmentName} · ${from} – ${to}`}
      generatedByName={profile.fullName}
      generatedAt={new Date().toISOString()}
    >
      <PdfTable title="Summary" columns={summaryColumns} rows={[summaryRow]} />
      <PdfNote>{summary.varianceLineCount} variance line{summary.varianceLineCount === 1 ? "" : "s"} in this period.</PdfNote>
      <PdfTable
        title="Variance by reason"
        columns={reasonColumns}
        rows={varianceRows.length > 0 ? varianceRows : [["No reasoned variances in period.", "", "", ""]]}
      />
      <PdfTable
        title="Book differences by reason (no currency value — a posting discrepancy, not a physical loss)"
        columns={bookDiffColumns}
        rows={bookDiffRows.length > 0 ? bookDiffRows : [["No reasoned book differences in period.", "", ""]]}
      />
    </ReportDocument>
  );

  return pdfResponse(doc, `period-summary-${summary.departmentName.toLowerCase().replace(/\s+/g, "-")}-${from}-to-${to}.pdf`);
}
