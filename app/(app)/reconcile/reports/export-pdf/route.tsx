import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getVarianceByReasonReport } from "@/lib/reconcile/actions";
import { listCountDepartments } from "@/lib/counts/actions";
import { ReportDocument, PdfTable, type PdfColumn } from "@/lib/pdf/ReportDocument";
import { formatNairaPdf, signedQtyPdf } from "@/lib/pdf/theme";
import { pdfResponse } from "@/lib/pdf/respond";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;

  const [departments, { varianceRows, bookDiffRows }] = await Promise.all([
    listCountDepartments(),
    getVarianceByReasonReport({ departmentId, from, to }),
  ]);
  const departmentName = departmentId ? departments.find((d) => d.id === departmentId)?.name ?? "—" : "All departments";

  const varianceColumns: PdfColumn[] = [
    { header: "Reason", width: 40 },
    { header: "Lines", width: 20, align: "right" },
    { header: "Total quantity", width: 20, align: "right" },
    { header: "Total value", width: 20, align: "right" },
  ];
  const varianceTableRows = varianceRows.map((r) => [r.label, String(r.lineCount), signedQtyPdf(r.totalQuantity), formatNairaPdf(r.totalValue ?? 0)]);

  const bookDiffColumns: PdfColumn[] = [
    { header: "Reason", width: 50 },
    { header: "Lines", width: 25, align: "right" },
    { header: "Total quantity", width: 25, align: "right" },
  ];
  const bookDiffTableRows = bookDiffRows.map((r) => [r.label, String(r.lineCount), signedQtyPdf(r.totalQuantity)]);

  const doc = (
    <ReportDocument
      title="Variance by reason"
      scopeLine={`${departmentName} · ${from ?? "earliest"} – ${to ?? "latest"}`}
      generatedByName={profile.fullName}
      generatedAt={new Date().toISOString()}
    >
      <PdfTable
        title="Physical variances by reason"
        columns={varianceColumns}
        rows={varianceTableRows.length > 0 ? varianceTableRows : [["No reasoned variances in range.", "", "", ""]]}
      />
      <PdfTable
        title="Book differences by reason (a posting discrepancy, not a physical loss — no value computed)"
        columns={bookDiffColumns}
        rows={bookDiffTableRows.length > 0 ? bookDiffTableRows : [["No reasoned book differences in range.", "", ""]]}
      />
    </ReportDocument>
  );

  return pdfResponse(doc, `variance-reasons-${new Date().toISOString().slice(0, 10)}.pdf`);
}
