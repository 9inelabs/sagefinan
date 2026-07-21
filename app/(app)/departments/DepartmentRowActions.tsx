"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { getDepartmentReferenceCounts, setDepartmentActive } from "@/lib/departments/actions";

type Counts = { movementCount: number; sessionCount: number; userCount: number; productCount: number };

export function DepartmentRowActions({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [reactivating, setReactivating] = useState(false);

  async function openDeactivate() {
    setDialogOpen(true);
    setCounts(await getDepartmentReferenceCounts(id));
  }

  async function reactivate() {
    setReactivating(true);
    await setDepartmentActive(id, true);
    router.refresh();
  }

  if (!isActive) {
    return (
      <button type="button" onClick={reactivate} disabled={reactivating} className="text-teal disabled:opacity-60">
        {reactivating ? "Reactivating…" : "Reactivate"}
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={openDeactivate} className="text-teal">
        Deactivate
      </button>

      <ConfirmDialog
        open={dialogOpen}
        title={`Deactivate ${name}?`}
        danger
        confirmLabel="Deactivate"
        description={
          counts ? (
            <>
              <p className="mb-2">
                <b className="text-ink font-medium">{name}</b> has <b className="text-ink font-medium">{counts.productCount}</b> product
                {counts.productCount === 1 ? "" : "s"} assigned, <b className="text-ink font-medium">{counts.userCount}</b> active user
                {counts.userCount === 1 ? "" : "s"}, and appears in <b className="text-ink font-medium">{counts.movementCount}</b> movement
                {counts.movementCount === 1 ? "" : "s"} and <b className="text-ink font-medium">{counts.sessionCount}</b> count session
                {counts.sessionCount === 1 ? "" : "s"}.
              </p>
              <p>Historical records stay intact — this only hides it from new counts, sales and requisitions, and it can be reactivated later.</p>
            </>
          ) : (
            "Loading…"
          )
        }
        onConfirm={async () => {
          await setDepartmentActive(id, false);
          setDialogOpen(false);
          router.refresh();
        }}
        onCancel={() => setDialogOpen(false)}
      />
    </>
  );
}
