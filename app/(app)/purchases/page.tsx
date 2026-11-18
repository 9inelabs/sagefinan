import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Card } from "@/components/ui/Card";
import { getReceivablePurchaseOrder } from "@/lib/purchase-orders/actions";
import { PurchaseBatchForm } from "./PurchaseBatchForm";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER") return <AccessDenied />;

  const { po } = await searchParams;
  const receivingPo = po ? await getReceivablePurchaseOrder(po) : null;

  if (po && !receivingPo) {
    return (
      <PageShell title="Purchases" subtitle="Goods arriving from a supplier into the central store">
        <Card title="This purchase order can't be received">
          <div className="p-5 pt-1 text-sm text-n600">
            Only an approved purchase order that hasn&apos;t been received yet can be recorded here.{" "}
            <Link href={`/purchase-orders/${po}`} className="text-brand font-medium">
              Open the purchase order →
            </Link>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Purchases" subtitle="Goods arriving from a supplier into the central store — quantity and amount paid per line">
      <PurchaseBatchForm key={receivingPo?.id ?? "new"} initialBusinessDay={todayIso()} receivingPo={receivingPo} />
    </PageShell>
  );
}
