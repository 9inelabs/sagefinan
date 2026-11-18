import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { getPurchaseOrder } from "@/lib/purchase-orders/actions";
import { formatPoNumber } from "@/lib/purchase-orders/format";
import { todayIso } from "@/lib/dates";
import { PurchaseOrderForm } from "../../PurchaseOrderForm";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  if (po.status !== "PENDING" && po.status !== "REJECTED") redirect(`/purchase-orders/${id}`);

  return (
    <PageShell
      title={`${profile.role === "ADMIN" && po.status === "PENDING" ? "Review" : "Edit"} ${formatPoNumber(po.poNumber)}`}
      subtitle={
        profile.role === "ADMIN" && po.status === "PENDING"
          ? "Add missing prices or quantities and make any changes, then approve"
          : "Saving sends it back for approval"
      }
    >
      <PurchaseOrderForm initial={po} today={todayIso()} approver={profile.role === "ADMIN" && po.status === "PENDING"} />
    </PageShell>
  );
}
