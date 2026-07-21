"use client";

import { useState } from "react";
import { Btn } from "./Button";

// Generic confirmation modal for destructive/consequential admin actions
// (deactivating a department/user, reassigning the central store). Not part
// of design/ui-draft.html — the prototype has no admin screens — so this
// follows the same ink/teal/hairline-border/6px-radius system as everything
// else rather than reproducing a specific prototype element.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={pending ? undefined : onCancel} />
      <div className="relative bg-white border border-n200 rounded max-w-[440px] w-full" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-n200">
          <h2 className="text-sm font-medium">{title}</h2>
        </div>
        <div className="p-4 text-sm text-n600 leading-relaxed">
          {description}
          {error ? <p className="text-red mt-3">{error}</p> : null}
        </div>
        <div className="p-4 border-t border-n200 flex justify-end gap-2">
          <Btn type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </Btn>
          <Btn type="button" variant={danger ? "pri" : "acc"} onClick={handleConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
