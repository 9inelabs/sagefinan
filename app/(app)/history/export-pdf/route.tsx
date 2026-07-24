import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { listCountSessionsForExport, listCountDepartments, type SessionStatus } from "@/lib/counts/actions";
import { ReportDocument, PdfTable, type PdfColumn } from "@/lib/pdf/ReportDocument";
import { signedNairaPdf } from "@/lib/pdf/theme";
import { pdfResponse } from "@/lib/pdf/respond";

const STATUS_LABEL: Record<SessionStatus, string> = {
  DRAFT: "In progress",
  COMPLETED: "Needs reconciling",
  LOCKED: "Locked",
};

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const q = url.searchParams.get("q") || undefined;

  const [departments, rows] = await Promise.all([
    listCountDepartments(),
    listCountSessionsForExport({
      departmentId,
      asAtFrom: from,
      asAtTo: to,
      statuses: status ? ([status as SessionStatus]) : undefined,
      productSearch: q,
    }),
  ]);

  const departmentName = departmentId ? departments.find((d) => d.id === departmentId)?.name ?? "—" : "All departments";
  const scopeParts = [
    departmentName,
    from || to ? `${from ?? "earliest"} – ${to ?? "latest"}` : "all dates",
    status ? STATUS_LABEL[status as SessionStatus] : "all statuses",
  ];
  if (q) scopeParts.push(`product: "${q}"`);

  const columns: PdfColumn[] = [
    { header: "As at", width: 12 },
    { header: "Department", width: 18 },
    { header: "Counted by", width: 18 },
    { header: "Products", width: 10, align: "right" },
    { header: "Counted", width: 10, align: "right" },
    { header: "Variances", width: 10, align: "right" },
    { header: "Value", width: 12, align: "right" },
    { header: "Status", width: 10 },
  ];

  const tableRows = rows.map((r) => [
    r.asAtDate,
    r.departmentName,
    r.countedByName,
    String(r.productCount),
    String(r.countedCount),
    r.varianceCount != null ? String(r.varianceCount) : "—",
    r.varianceValue != null ? signedNairaPdf(r.varianceValue) : "—",
    STATUS_LABEL[r.status],
  ]);

  const doc = (
    <ReportDocument
      title="Count history"
      scopeLine={`${scopeParts.join(" · ")} · ${rows.length} session${rows.length === 1 ? "" : "s"}`}
      generatedByName={profile.fullName}
      generatedAt={new Date().toISOString()}
    >
      <PdfTable columns={columns} rows={tableRows} />
    </ReportDocument>
  );

  return pdfResponse(doc, `count-history-${new Date().toISOString().slice(0, 10)}.pdf`);
}
