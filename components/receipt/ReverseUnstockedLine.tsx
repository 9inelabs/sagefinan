"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Undo2 } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { reverseUnstockedPurchaseLine } from "@/lib/movements/actions";

// The receipt drawer holds its receipt in client state, so a page refresh
// alone wouldn't update it — it provides this to reload itself instead.
export const ReceiptReloadContext = createContext<(() => void) | null>(null);

// "Reverse" on a purchase-receipt line that isn't stock. Appends a
// cancelling line (with the reason); the original stays visible, tagged
// Reversed, and every purchase total nets it out.
export function ReverseUnstockedLine({ lineId, description }: { lineId: string; description: string }) {
  const router = useRouter();
  const reload = useContext(ReceiptReloadContext);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function close() {
    setOpen(false);
    setReason("");
  }

  return (
    <>
      <button
        type="button"
        data-print-hide
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-n600 hover:text-red rounded-full px-2 py-0.5 ring-1 ring-inset ring-n200 hover:ring-red/40 transition-colors"
      >
        <Undo2 size={12} strokeWidth={2} />
        Reverse
      </button>
      <ConfirmDialog
        open={open}
        title={`Reverse “${description}”?`}
        description={
          <>
            <p className="mb-3">
              Adds a cancelling line so this item no longer counts towards what was paid. The original stays on the receipt, marked Reversed —
              nothing is deleted. It can&apos;t be undone.
            </p>
            <Field label="Reason (required)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered twice, wrong amount" autoFocus />
            </Field>
          </>
        }
        confirmLabel="Post reversal"
        onCancel={close}
        onConfirm={async () => {
          await reverseUnstockedPurchaseLine(lineId, reason);
          close();
          reload?.();
          router.refresh();
        }}
      />
    </>
  );
}
