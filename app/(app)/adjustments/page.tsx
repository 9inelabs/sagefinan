import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { listAdjustmentDepartments, listAdjustments } from "@/lib/adjustments/actions";
import { yesterdayIso } from "@/lib/dates";
import { AdjustmentForm } from "./AdjustmentForm";
import { AdjustmentList } from "@/components/adjustments/AdjustmentList";

export default async function AdjustmentsPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const [departments, recent] = await Promise.all([listAdjustmentDepartments(), listAdjustments({ limit: 15 })]);

  return (
    <PageShell title="Adjustments" subtitle="Remove expired or damaged stock, or add found stock — with a reason, straight into the ledger">
      <AdjustmentForm departments={departments} initialBusinessDay={yesterdayIso()} />
      <div className="mt-3">
        <AdjustmentList rows={recent} title="Recent adjustments" extra="latest 15 · full list in Reports" />
      </div>
    </PageShell>
  );
}
