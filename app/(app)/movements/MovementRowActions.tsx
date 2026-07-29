"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { reverseMovement } from "@/lib/movements/actions";

// The list-page counterpart to ReverseMovementForm.tsx (the detail page's own
// reverse flow) — same reverseMovement() action, same required reason, just
// triggered without leaving the list. ConfirmDialog's description accepts any
// ReactNode, so the reason field lives directly in the dialog rather than
// needing a bespoke modal.
export function MovementRowActions({ movementId }: { movementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  function close() {
    setOpen(false);
    setReason("");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-graphite text-sm whitespace-nowrap">
        Reverse
      </button>

      <ConfirmDialog
        open={open}
        title="Reverse this movement?"
        description={
          <>
            <p className="mb-3">
              Posts a new movement with the opposite effect, cancelling this one out — both stay visible in the history, nothing is deleted.
            </p>
            <Field label="Reason (required)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered against the wrong department" autoFocus />
            </Field>
          </>
        }
        confirmLabel="Post reversal"
        onCancel={close}
        onConfirm={async () => {
          await reverseMovement(movementId, reason);
          close();
          router.refresh();
        }}
      />
    </>
  );
}
