import type { Database } from "@/lib/supabase/database.types";

export function formatPoNumber(n: number) {
  return `PO-${String(n).padStart(4, "0")}`;
}

export const PO_STATUS_META: Record<
  Database["public"]["Enums"]["purchase_order_status"],
  { label: string; variant: "warn" | "ok" | "bad" | "acc" }
> = {
  PENDING: { label: "Awaiting approval", variant: "warn" },
  APPROVED: { label: "Approved", variant: "acc" },
  REJECTED: { label: "Rejected", variant: "bad" },
  RECEIVED: { label: "Received", variant: "ok" },
};
