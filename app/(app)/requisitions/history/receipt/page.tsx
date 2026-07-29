import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { getRequisitionReceiptDetail } from "@/lib/requisitions/actions";
import { ReceiptView } from "@/components/receipt/ReceiptView";

type SearchParams = { department?: string; day?: string; by?: string };

export default async function RequisitionReceiptPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "AUDITOR" && profile.role !== "STOREKEEPER" && profile.role !== "DEPARTMENT_USER") {
    return <AccessDenied />;
  }

  const { department, day, by } = await searchParams;
  if (!department || !day || !by) notFound();

  const detail = await getRequisitionReceiptDetail(department, day, by);
  if (!detail) notFound();

  const sp = new URLSearchParams({ department, day, by });

  return (
    <PageShell title="Requisition receipt" subtitle={`${detail.departmentName} · ${detail.businessDay}`}>
      <ReceiptView
        kind="Requisition"
        businessDay={detail.businessDay}
        departmentName={detail.departmentName}
        createdByName={detail.createdByName}
        lines={detail.lines.map((l) => ({
          id: l.id,
          code: l.productCode,
          name: l.productName,
          quantity: l.quantity,
          isOverride: l.isOverride,
          isReversal: l.isReversal,
          isReversed: l.isReversed,
        }))}
        backHref="/requisitions/history"
        pdfHref={`/requisitions/history/receipt/export-pdf?${sp.toString()}`}
      />
    </PageShell>
  );
}
