import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Stat } from "@/components/ui/Stat";
import { ReportsNav } from "@/components/reports/ReportsNav";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { PurchaseOrderList } from "@/components/purchase-orders/PurchaseOrderList";
import { listPurchaseOrders, type PurchaseOrderStatus } from "@/lib/purchase-orders/actions";
import { PO_STATUS_META } from "@/lib/purchase-orders/format";
import { formatNaira } from "@/lib/format";
import { monthStartIso, todayIso } from "@/lib/dates";

export default async function PurchaseOrdersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; status?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "AUDITOR" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  const sp = await searchParams;
  const from = sp.from || monthStartIso();
  const to = sp.to || todayIso();
  const status = (Object.keys(PO_STATUS_META) as PurchaseOrderStatus[]).includes(sp.status as PurchaseOrderStatus) ? (sp.status as PurchaseOrderStatus) : "";
  const orders = await listPurchaseOrders({ from, to, q: sp.q, status });
  const sum = (s: PurchaseOrderStatus) => orders.filter((o) => o.status === s).reduce((t, o) => t + o.total, 0);

  return (
    <PageShell title="Purchase orders" subtitle="Every order raised, with its approval status and total">
      <ReportsNav active="purchase-orders" role={profile.role} />
      <ReportFilterBar
        basePath="/reports/purchase-orders"
        initial={{ from, to, q: sp.q, status }}
        searchPlaceholder="Supplier"
        statuses={(Object.keys(PO_STATUS_META) as PurchaseOrderStatus[]).map((s) => ({ value: s, label: PO_STATUS_META[s].label }))}
      />
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-3">
        <Stat variant="hero" label="Approved value" value={formatNaira(sum("APPROVED") + sum("RECEIVED"))} footer={`${orders.length} order${orders.length === 1 ? "" : "s"} in period`} />
        <Stat label="Awaiting approval" value={formatNaira(sum("PENDING"))} footer={`${orders.filter((o) => o.status === "PENDING").length} orders`} />
        <Stat label="Received" value={formatNaira(sum("RECEIVED"))} footer={`${orders.filter((o) => o.status === "RECEIVED").length} orders`} />
        <Stat label="Rejected" value={formatNaira(sum("REJECTED"))} footer={`${orders.filter((o) => o.status === "REJECTED").length} orders`} />
      </div>
      <PurchaseOrderList orders={orders} emptyText="No purchase orders match these filters." />
    </PageShell>
  );
}
