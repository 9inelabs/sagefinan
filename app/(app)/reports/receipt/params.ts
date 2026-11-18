import type { ReceiptKind, ReceiptParams } from "@/lib/receipts/actions";

const KINDS: ReceiptKind[] = ["SALE", "REQUISITION", "PURCHASE", "ADJUSTMENT"];

export function parseReceiptParams(sp: { [k: string]: string | string[] | undefined } | URLSearchParams): ReceiptParams | null {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : typeof sp[k] === "string" ? (sp[k] as string) : null);
  const kind = (get("kind") ?? "").toUpperCase() as ReceiptKind;
  const day = get("day");
  const by = get("by");
  if (!KINDS.includes(kind) || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !by) return null;
  return { kind, day, by, department: get("department"), po: get("po") };
}

export function receiptQuery(p: ReceiptParams) {
  const q = new URLSearchParams({ kind: p.kind, day: p.day, by: p.by });
  if (p.department) q.set("department", p.department);
  if (p.po) q.set("po", p.po);
  return q.toString();
}

export const RECEIPT_BACK: Record<ReceiptKind, { href: string; label: string }> = {
  SALE: { href: "/sales/history", label: "Sales" },
  REQUISITION: { href: "/requisitions/history", label: "Requisitions" },
  PURCHASE: { href: "/reports/purchases", label: "Purchases" },
  ADJUSTMENT: { href: "/reports/adjustments", label: "Adjustments" },
};
