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
  if (po.status === "RECEIVED") redirect(`/purchase-orders/${id}`);

  const reviewing = profile.role === "ADMIN" && po.status === "PENDING";
  // An admin editing an approved order keeps it approved; a storekeeper's edit
  // sends it back for approval (save_purchase_order enforces both).
  const keepsApproval = profile.role === "ADMIN" && po.status === "APPROVED";

  return (
    <PageShell
      title={`${reviewing ? "Review" : "Edit"} ${formatPoNumber(po.poNumber)}`}
      subtitle={
        reviewing
          ? "Add missing prices or quantities and make any changes, then approve"
          : keepsApproval
            ? "Add items or change quantities and prices — the order stays approved"
            : po.status === "APPROVED"
              ? "This order is approved — saving changes sends it back to an admin for approval"
              : "Saving sends it back for approval"
      }
    >
      <PurchaseOrderForm initial={po} today={todayIso()} approver={reviewing} keepsApproval={keepsApproval} />
    </PageShell>
  );
}
