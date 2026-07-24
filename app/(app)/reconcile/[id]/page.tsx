import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Btn } from "@/components/ui/Button";
import { getCountSessionMeta } from "@/lib/counts/actions";
import { getReconcileData, getSessionAuditTrail } from "@/lib/reconcile/actions";
import { listReasonCodes } from "@/lib/reason-codes/actions";
import { ReconcileScreen } from "./ReconcileScreen";

export default async function ReconcileSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { id } = await params;
  const meta = await getCountSessionMeta(id);
  if (meta.status === "DRAFT") {
    redirect(`/count/${id}`);
  }

  const [{ session, lines, progress }, auditTrail, reasonCodes] = await Promise.all([
    getReconcileData(id),
    getSessionAuditTrail(id),
    listReasonCodes(true),
  ]);

  return (
    <PageShell
      title="Reconcile"
      subtitle={`${session.departmentName} · ${progress.reconciled} of ${progress.total} reconciled`}
      actions={
        <Link href={`/reconcile/${id}/export-pdf`}>
          <Btn>Export PDF</Btn>
        </Link>
      }
    >
      <ReconcileScreen
        session={session}
        initialLines={lines}
        auditTrail={auditTrail}
        reasonCodes={reasonCodes}
        currentUserName={profile.fullName}
      />
    </PageShell>
  );
}
