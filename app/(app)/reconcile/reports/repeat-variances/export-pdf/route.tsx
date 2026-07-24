import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getRepeatVarianceReport } from "@/lib/reconcile/actions";
import { listCountDepartments } from "@/lib/counts/actions";
import { thirtyDaysAgoIso, todayIso } from "@/lib/dates";
import { ReportDocument, PdfTable, type PdfColumn } from "@/lib/pdf/ReportDocument";
import { formatNairaPdf, signedQtyPdf } from "@/lib/pdf/theme";
import { pdfResponse } from "@/lib/pdf/respond";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;
  const from = url.searchParams.get("from") || thirtyDaysAgoIso();
  const to = url.searchParams.get("to") || todayIso();
  const sort = url.searchParams.get("sort") === "value" ? "value" : "occurrences";

  const [departments, rows] = await Promise.all([listCountDepartments(), getRepeatVarianceReport({ departmentId, from, to, sort })]);
  const departmentName = departmentId ? departments.find((d) => d.id === departmentId)?.name ?? "—" : "All departments";

  const columns: PdfColumn[] = [
    { header: "Product", width: 34 },
    { header: "Department", width: 22 },
    { header: "Occurrences", width: 14, align: "right" },
    { header: "Total", width: 15, align: "right" },
    { header: "Value", width: 15, align: "right" },
  ];
  const tableRows = rows.map((r) => [
    `${r.productName} (${r.productCode})`,
    r.departmentName,
    String(r.occurrences),
    signedQtyPdf(r.totalVariance),
    formatNairaPdf(r.totalValue),
  ]);

  const doc = (
    <ReportDocument
      title="Repeat variances"
      scopeLine={`${departmentName} · ${from} – ${to} · ${rows.length} product${rows.length === 1 ? "" : "s"}`}
      generatedByName={profile.fullName}
      generatedAt={new Date().toISOString()}
    >
      <PdfTable columns={columns} rows={tableRows.length > 0 ? tableRows : [["No repeat variances in range.", "", "", "", ""]]} />
    </ReportDocument>
  );

  return pdfResponse(doc, `repeat-variances-${from}-to-${to}.pdf`);
}
