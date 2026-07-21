"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setUserActive } from "@/lib/users/actions";

export function UserRowActions({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await setUserActive(id, !isActive);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={toggle} disabled={pending} className="text-teal text-sm disabled:opacity-60 whitespace-nowrap">
        {pending ? "Working…" : isActive ? "Deactivate" : "Reactivate"}
      </button>
      {error ? <span className="text-xs text-red text-right max-w-[220px]">{error}</span> : null}
    </div>
  );
}
