"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { reverseMovement } from "@/lib/movements/actions";

export function ReverseMovementForm({ movementId }: { movementId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Card title="Correction">
        <div className="p-4 text-sm">
          <p className="text-n600 mb-3">
            Movements can&apos;t be edited once posted. To correct this one, post a reversal — a new movement with the opposite effect,
            carrying a reason and a link back to this record.
          </p>
          <Btn type="button" onClick={() => setOpen(true)}>
            Reverse this movement
          </Btn>
        </div>
      </Card>
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const { id } = await reverseMovement(movementId, reason);
      router.push(`/movements/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the reversal.");
      setPending(false);
    }
  }

  return (
    <Card title="Reverse this movement">
      <div className="p-4 text-sm">
        <Field label="Reason (required)" hint="Recorded on the reversal and visible to anyone reviewing this movement.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. entered against the wrong department" autoFocus />
        </Field>
        {error ? <p className="text-red mb-3">{error}</p> : null}
        <div className="flex gap-2">
          <Btn type="button" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Btn>
          <Btn type="button" variant="pri" onClick={submit} disabled={pending || !reason.trim()}>
            {pending ? "Posting…" : "Post reversal"}
          </Btn>
        </div>
      </div>
    </Card>
  );
}
