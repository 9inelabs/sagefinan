import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { listRequisitionDestinations } from "@/lib/movements/actions";
import { RequisitionBatchForm } from "./RequisitionBatchForm";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function RequisitionsPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  const destinations = await listRequisitionDestinations();

  return (
    <PageShell title="Requisitions" subtitle="Central store · movements to departments">
      <RequisitionBatchForm initialBusinessDay={todayIso()} destinations={destinations} />
    </PageShell>
  );
}
