import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Btn } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { listPurchaseOrders, type PurchaseOrderStatus } from "@/lib/purchase-orders/actions";
import { PurchaseOrderList } from "@/components/purchase-orders/PurchaseOrderList";
import { formatNaira } from "@/lib/format";

const TABS: { key: "" | PurchaseOrderStatus; label: string }[] = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Awaiting approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "RECEIVED", label: "Received" },
  { key: "REJECTED", label: "Rejected" },
];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  const { status: rawStatus } = await searchParams;
  const status = TABS.some((t) => t.key === rawStatus) ? (rawStatus as "" | PurchaseOrderStatus) : "";
  const all = await listPurchaseOrders();
  const orders = status ? all.filter((o) => o.status === status) : all;
  const pending = all.filter((o) => o.status === "PENDING");
  const approved = all.filter((o) => o.status === "APPROVED");

  return (
    <PageShell
      title="Purchase orders"
      subtitle={profile.role === "ADMIN" ? "Approve orders raised by the storekeeper, then download them as PDF" : "Raise an order for approval before buying"}
      actions={
        <Link href="/purchase-orders/new">
          <Btn variant="acc" className="h-9.5">
            <Plus size={15} strokeWidth={2} className="text-brand-bright" />
            New purchase order
          </Btn>
        </Link>
      }
    >
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-3">
        <Stat
          variant="hero"
          label="Awaiting approval"
          value={String(pending.length)}
          footer={pending.length > 0 ? `${formatNaira(pending.reduce((s, o) => s + o.total, 0))} in total` : "nothing waiting"}
        />
        <Stat label="Approved, not yet received" value={String(approved.length)} footer={formatNaira(approved.reduce((s, o) => s + o.total, 0))} />
        <Stat label="Received" value={String(all.filter((o) => o.status === "RECEIVED").length)} />
        <Stat label="Rejected" value={String(all.filter((o) => o.status === "REJECTED").length)} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist">
        {TABS.map((t) => {
          const on = t.key === status;
          const count = t.key ? all.filter((o) => o.status === t.key).length : all.length;
          return (
            <Link
              key={t.key || "all"}
              href={t.key ? `/purchase-orders?status=${t.key}` : "/purchase-orders"}
              role="tab"
              aria-selected={on}
              className={`inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-full text-[12px] transition-colors ${
                on ? "bg-ink text-white" : "bg-white text-ink shadow-premium hover:bg-brand-hover"
              }`}
            >
              {t.label}
              <span className={`tabular-nums text-[11px] ${on ? "text-on-dark-mut" : "text-n600"}`}>{count}</span>
            </Link>
          );
        })}
      </div>

      <PurchaseOrderList orders={orders} emptyText={status ? "No purchase orders with this status." : "No purchase orders yet — raise one to get started."} />
    </PageShell>
  );
}
