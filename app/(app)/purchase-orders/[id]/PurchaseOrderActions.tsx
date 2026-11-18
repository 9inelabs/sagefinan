"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Check, PackagePlus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { approvePurchaseOrder, deletePurchaseOrder, rejectPurchaseOrder, type PurchaseOrderStatus } from "@/lib/purchase-orders/actions";
import type { UserRole } from "@/lib/auth/profile";

export function PurchaseOrderActions({
  id,
  status,
  role,
  canReceive,
  linkedLines,
}: {
  id: string;
  status: PurchaseOrderStatus;
  role: UserRole;
  canReceive: boolean;
  linkedLines: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "approve">(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const isAdmin = role === "ADMIN";
  const canWithdraw = (status === "PENDING" || status === "REJECTED") && role !== "AUDITOR";

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      await approvePurchaseOrder(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve.");
    } finally {
      setBusy(null);
    }
  }

  const big =
    "w-full h-12 rounded-[14px] inline-flex items-center justify-center gap-2 text-[13.5px] font-medium transition-[transform,filter,background-color] duration-200 active:scale-[0.98]";

  return (
    <section className="surface-dark rounded-premium p-5 animate-rise [animation-delay:90ms]">
      {status === "PENDING" && isAdmin ? (
        <>
          <p className="text-[11.5px] text-on-dark-mut">Your decision</p>
          <p className="text-[14px] mt-0.5">This order is waiting for your approval.</p>
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={approve} disabled={busy !== null} className={`${big} bg-brand-bright text-frame hover:brightness-105 shadow-glow`}>
              {busy === "approve" ? <Spinner size={16} /> : <Check size={16} strokeWidth={2.4} />}
              {busy === "approve" ? "Approving…" : "Approve order"}
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={busy !== null}
              className={`${big} bg-white/[0.06] ring-1 ring-inset ring-white/10 text-on-dark hover:bg-white/10`}
            >
              <X size={16} strokeWidth={2} />
              Reject…
            </button>
          </div>
        </>
      ) : status === "PENDING" ? (
        <>
          <p className="text-[11.5px] text-on-dark-mut">Status</p>
          <p className="text-[14px] mt-0.5">Waiting for an admin to approve.</p>
          <p className="text-[11.5px] text-on-dark-mut mt-2">You can still edit or withdraw it until then.</p>
        </>
      ) : status === "APPROVED" ? (
        <>
          <p className="text-[11.5px] text-on-dark-mut">Approved</p>
          <p className="text-[14px] mt-0.5">Download the PDF to send to the supplier.</p>
          {canReceive ? (
            <>
              <p className="text-[11.5px] text-on-dark-mut mt-2">
                When the goods arrive, receive the {linkedLines} stock item{linkedLines === 1 ? "" : "s"} into the central store.
              </p>
              <Link href={`/purchases?po=${id}`} className={`${big} mt-4 bg-brand-bright text-frame hover:brightness-105 shadow-glow`}>
                <PackagePlus size={16} strokeWidth={2} />
                Receive goods
              </Link>
            </>
          ) : null}
        </>
      ) : status === "RECEIVED" ? (
        <>
          <p className="text-[11.5px] text-on-dark-mut">Complete</p>
          <p className="text-[14px] mt-0.5">Goods received and recorded as a purchase.</p>
        </>
      ) : (
        <>
          <p className="text-[11.5px] text-on-dark-mut">Rejected</p>
          <p className="text-[14px] mt-0.5">Edit the order to resubmit it, or withdraw it.</p>
        </>
      )}

      {canWithdraw ? (
        <button
          type="button"
          onClick={() => setWithdrawOpen(true)}
          className="mt-3 w-full h-9 rounded-[12px] inline-flex items-center justify-center gap-1.5 text-[12px] text-on-dark-mut hover:text-red-on-dark hover:bg-white/[0.05]"
        >
          <Trash2 size={14} strokeWidth={1.75} />
          Withdraw order
        </button>
      ) : null}

      {error ? <p className="mt-3 text-[12px] text-red-on-dark">{error}</p> : null}

      <ConfirmDialog
        open={rejectOpen}
        title="Reject this purchase order?"
        danger
        confirmLabel="Reject order"
        description={
          <div>
            <p className="mb-3">The storekeeper will see your reason and can edit and resubmit the order.</p>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. prices too high, buy half" autoFocus />
          </div>
        }
        onCancel={() => setRejectOpen(false)}
        onConfirm={async () => {
          await rejectPurchaseOrder(id, reason);
          setRejectOpen(false);
          setReason("");
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={withdrawOpen}
        title="Withdraw this purchase order?"
        danger
        confirmLabel="Withdraw"
        description="It will be removed completely. Only orders that were never approved can be withdrawn."
        onCancel={() => setWithdrawOpen(false)}
        onConfirm={async () => {
          await deletePurchaseOrder(id);
          router.push("/purchase-orders");
        }}
      />
    </section>
  );
}
