import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { PurchaseBatchForm } from "./PurchaseBatchForm";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function PurchasesPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  return (
    <PageShell title="Purchases" subtitle="Goods arriving from a supplier into the central store">
      <PurchaseBatchForm initialBusinessDay={todayIso()} />
    </PageShell>
  );
}
