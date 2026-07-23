import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { getMovementDetail } from "@/lib/movements/actions";
import { ReverseMovementForm } from "./ReverseMovementForm";

const TYPE_LABEL = { PURCHASE: "Purchase", REQUISITION: "Requisition", SALE: "Sale", OPENING: "Opening balance" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-n200 last:border-b-0 flex flex-col min-[600px]:flex-row min-[600px]:items-center gap-1 min-[600px]:gap-4">
      <span className="text-xs text-n600 min-[600px]:w-40 flex-none">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default async function MovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  const { id } = await params;
  const movement = await getMovementDetail(id);
  if (!movement) notFound();

  const canReverse =
    (profile.role === "ADMIN" || (profile.role === "STOREKEEPER" && movement.type !== "OPENING")) &&
    !movement.isReversal &&
    !movement.isReversed;

  return (
    <PageShell title="Movement detail" subtitle={`${TYPE_LABEL[movement.type]} · ${movement.businessDay}`}>
      <div className="flex flex-col gap-4 max-w-[720px]">
        <Card
          title={`${movement.productName} (${movement.productCode})`}
          extra={
            movement.isOverride || movement.isReversal || movement.isReversed
              ? [movement.isOverride && "override", movement.isReversal && "reversal", movement.isReversed && "reversed"]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        >
          <div>
            <Row label="Type">{TYPE_LABEL[movement.type]}</Row>
            <Row label="Business day">
              <span className="tabular-nums">{movement.businessDay}</span>
            </Row>
            <Row label="Recorded at">{new Date(movement.createdAt).toLocaleString("en-GB")}</Row>
            <Row label="Quantity">
              <span className="tabular-nums font-medium">{movement.quantity} bottles</span>
            </Row>
            <Row label="From">{movement.fromDepartmentName ?? "—"}</Row>
            <Row label="To">{movement.toDepartmentName ?? "—"}</Row>
            <Row label="Entered by">{movement.createdByName}</Row>
            <Row label="Received by">{movement.receivedByName ?? "—"}</Row>
            {movement.supplierName ? <Row label="Supplier">{movement.supplierName}</Row> : null}
            {movement.invoiceReference ? <Row label="Invoice / delivery note">{movement.invoiceReference}</Row> : null}
            {movement.isOverride ? (
              <Row label="Override reason">
                <span className="text-amber">{movement.overrideReason}</span>
              </Row>
            ) : null}
            {movement.note ? <Row label="Note">{movement.note}</Row> : null}
            {movement.isReversal && movement.reversalOfMovementId ? (
              <Row label="Reverses">
                <Tag variant="mut">Reversal</Tag>{" "}
                <Link href={`/movements/${movement.reversalOfMovementId}`} className="text-teal ml-1">
                  View the original movement →
                </Link>
              </Row>
            ) : null}
            {movement.isReversed && movement.reversedByMovementId ? (
              <Row label="Reversed by">
                <Tag variant="bad">Reversed</Tag>{" "}
                <Link href={`/movements/${movement.reversedByMovementId}`} className="text-teal ml-1">
                  View the reversal →
                </Link>
              </Row>
            ) : null}
          </div>
        </Card>

        {canReverse ? <ReverseMovementForm movementId={movement.id} /> : null}
      </div>
    </PageShell>
  );
}
