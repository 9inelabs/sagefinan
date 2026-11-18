import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { todayIso } from "@/lib/dates";
import { PurchaseOrderForm } from "../PurchaseOrderForm";

export default async function NewPurchaseOrderPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  return (
    <PageShell title="New purchase order" subtitle="List what you need to buy — it goes to an admin for approval">
      <PurchaseOrderForm initial={null} today={todayIso()} />
    </PageShell>
  );
}
