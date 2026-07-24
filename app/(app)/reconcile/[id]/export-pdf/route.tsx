import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getReconcileData, getSessionAuditTrail } from "@/lib/reconcile/actions";
import { ReportDocument, PdfTable, type PdfColumn } from "@/lib/pdf/ReportDocument";
import { formatNairaPdf, signedQtyPdf } from "@/lib/pdf/theme";
import { pdfResponse } from "@/lib/pdf/respond";

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Needs reconciling",
  LOCKED: "Locked",
};

const KIND_LABEL: Record<string, string> = {
  created: "Created",
  finished: "Finished",
  reason: "Reason",
  locked: "Locked",
  adjustment: "Adjustment",
  "post-lock-adjustment": "Post-lock adjustment",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { id } = await params;
  const [{ session, lines, progress }, auditTrail] = await Promise.all([getReconcileData(id), getSessionAuditTrail(id)]);

  const lineColumns: PdfColumn[] = [
    { header: "Product", width: 22 },
    { header: "Expected", width: 9, align: "right" },
    { header: "Counted", width: 9, align: "right" },
    { header: "Ledger", width: 9, align: "right" },
    { header: "Variance", width: 9, align: "right" },
    { header: "Value", width: 10, align: "right" },
    { header: "Flag", width: 10 },
    { header: "Reason", width: 22 },
  ];

  const lineRows = lines.map((l) => [
    `${l.name} (${l.code})`,
    String(l.expectedQty),
    String(l.countedQty),
    l.ledgerQty != null ? String(l.ledgerQty) : "—",
    l.variance !== 0 ? signedQtyPdf(l.variance) : "—",
    l.variance !== 0 ? formatNairaPdf(l.value) : "—",
    [l.variance !== 0 ? (l.flag === "short" ? "Short" : "Excess") : null, l.bookDiffers ? "Book differs" : null].filter(Boolean).join(" + "),
    [l.note, l.bookDiffNote].filter(Boolean).join(" / ") || "—",
  ]);

  const auditColumns: PdfColumn[] = [
    { header: "When", width: 18 },
    { header: "Event", width: 16 },
    { header: "By", width: 16 },
    { header: "Detail", width: 50 },
  ];

  const auditRows = auditTrail.map((e) => [new Date(e.at).toLocaleString("en-GB"), KIND_LABEL[e.kind] ?? e.kind, e.actorName ?? "—", e.description]);

  const doc = (
    <ReportDocument
      title="Count session detail"
      scopeLine={`${session.departmentName} · as at ${session.asAtDate} · ${STATUS_LABEL[session.status] ?? session.status} · ${progress.reconciled} of ${progress.total} reconciled`}
      generatedByName={profile.fullName}
      generatedAt={new Date().toISOString()}
    >
      <PdfTable title="Variances" columns={lineColumns} rows={lineRows.length > 0 ? lineRows : [["Every product tallies.", "", "", "", "", "", "", ""]]} />
      <PdfTable title="Audit trail" columns={auditColumns} rows={auditRows} />
    </ReportDocument>
  );

  return pdfResponse(doc, `reconcile-${session.departmentName.toLowerCase().replace(/\s+/g, "-")}-${session.asAtDate}.pdf`);
}
