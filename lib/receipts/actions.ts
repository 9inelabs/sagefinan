"use server";

import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { adjustmentCategoryLabel } from "@/lib/movements/labels";

// One receipt model for every transaction type (CLAUDE.md: "Purchase
// amounts, purchase orders, adjustments, reports"). A receipt is a group of
// movements: one batch posted by one person on one business day (and, for
// sales/requisitions/adjustments, one department) — the same grouping the
// history lists already use. Rendered by components/receipt/ReceiptView.tsx
// on screen and lib/pdf/ReceiptDocument.tsx as a PDF.

export type ReceiptKind = "SALE" | "REQUISITION" | "PURCHASE" | "ADJUSTMENT";

export type ReceiptParams = {
  kind: ReceiptKind;
  day: string;
  by: string;
  department?: string | null;
  po?: string | null;
};

export type ReceiptLine = {
  id: string;
  code: string | null; // null for an unstocked purchase item
  name: string;
  quantity: number; // signed: reversals and stock removals are negative; 0 for unstocked items
  quantityText: string | null; // free-text quantity of an unstocked purchase item ("20kg")
  unstocked: boolean;
  unitPrice: number | null;
  amount: number | null; // signed like quantity
  flags: string[];
  note: string | null;
};

export type ReceiptData = {
  kind: ReceiptKind;
  title: string;
  reference: string;
  businessDay: string;
  recordedAt: string;
  createdByName: string;
  headline: string; // department / route / supplier shown large in the header
  details: { label: string; value: string; href?: string }[];
  valueLabel: string;
  // Requisition receipts carry no prices or values at all (they're seen by
  // department staff) — the loader nulls them and the views drop the columns.
  showPrices: boolean;
  lines: ReceiptLine[];
  totals: { items: number; quantity: number; amount: number };
};

const TITLES: Record<ReceiptKind, string> = {
  SALE: "Sales receipt",
  REQUISITION: "Requisition receipt",
  PURCHASE: "Purchase receipt",
  ADJUSTMENT: "Stock adjustment",
};
const PREFIX: Record<ReceiptKind, string> = { SALE: "SAL", REQUISITION: "REQ", PURCHASE: "PUR", ADJUSTMENT: "ADJ" };

export async function getReceipt(params: ReceiptParams): Promise<ReceiptData | null> {
  const profile = await getCurrentProfile();
  const { kind, day, by, department, po } = params;

  // Role scoping mirrors each history screen's own access rules.
  if (kind === "PURCHASE" && !["ADMIN", "AUDITOR", "STOREKEEPER"].includes(profile.role)) return null;
  if (kind === "ADJUSTMENT" && !["ADMIN", "AUDITOR"].includes(profile.role)) return null;
  if ((kind === "SALE" || kind === "REQUISITION") && profile.role === "DEPARTMENT_USER" && profile.departmentId !== department) return null;
  if (kind !== "PURCHASE" && !department) return null;

  const admin = createAdminClient();
  let query = admin.from("movements_detail").select("*").eq("type", kind).eq("business_day", day).eq("created_by", by);
  if (kind === "SALE") query = query.eq("from_department_id", department!);
  if (kind === "REQUISITION") query = query.eq("to_department_id", department!);
  if (kind === "ADJUSTMENT") query = query.or(`from_department_id.eq.${department},to_department_id.eq.${department}`);
  if (kind === "PURCHASE" && po) query = query.eq("purchase_order_id", po);
  const showPrices = kind !== "REQUISITION";
  const [{ data: moved, error }, unstockedResult] = await Promise.all([
    query.order("created_at", { ascending: true }),
    kind === "PURCHASE"
      ? (() => {
          let u = admin.from("purchase_unstocked_lines").select("*").eq("business_day", day).eq("created_by", by);
          if (po) u = u.eq("purchase_order_id", po);
          return u.order("created_at", { ascending: true });
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw new Error(error.message);
  if (unstockedResult.error) throw new Error(unstockedResult.error.message);
  const data = moved ?? [];
  const unstockedRows = (unstockedResult.data ?? []) as {
    id: string;
    created_at: string;
    created_by: string;
    supplier_name: string | null;
    invoice_reference: string | null;
    purchase_order_id: string | null;
    description: string;
    quantity_text: string | null;
    amount: number;
  }[];
  if (data.length === 0 && unstockedRows.length === 0) return null;

  const lines: ReceiptLine[] = data.map((m) => {
    const reversal = m.reversal_of_movement_id != null;
    const removal = kind === "ADJUSTMENT" && m.from_department_id != null;
    const sign = (reversal ? -1 : 1) * (removal ? -1 : 1);
    const qty = sign * m.quantity!;
    const unitCost = Number(m.unit_cost ?? 0);
    const paid = m.amount != null ? Number(m.amount) : null;
    const flags = [
      reversal ? "Reversal" : null,
      m.reversed_by_movement_id ? "Reversed" : null,
      m.is_override ? "Override" : null,
      kind === "ADJUSTMENT" ? adjustmentCategoryLabel(m.adjustment_category) : null,
    ].filter((f): f is string => !!f);
    return {
      id: m.id!,
      code: m.product_code!,
      name: m.product_name!,
      quantity: qty,
      quantityText: null,
      unstocked: false,
      unitPrice: !showPrices ? null : kind === "PURCHASE" ? (paid != null && m.quantity ? paid / m.quantity! : null) : unitCost,
      amount: !showPrices ? null : kind === "PURCHASE" ? (paid != null ? sign * paid : null) : qty * unitCost,
      flags,
      note: m.override_reason ?? (kind === "ADJUSTMENT" || reversal ? m.note : null),
    };
  });
  for (const u of unstockedRows) {
    lines.push({
      id: u.id,
      code: null,
      name: u.description,
      quantity: 0,
      quantityText: u.quantity_text,
      unstocked: true,
      unitPrice: null,
      amount: Number(u.amount),
      flags: ["Not stocked"],
      note: null,
    });
  }

  // Header fields come from the first movement, or — for a purchase made
  // only of unstocked items — from the first unstocked line.
  const first = data[0] ?? {
    id: unstockedRows[0].id,
    created_at: unstockedRows[0].created_at,
    created_by_name: null as string | null,
    supplier_name: unstockedRows[0].supplier_name,
    invoice_reference: unstockedRows[0].invoice_reference,
    purchase_order_id: unstockedRows[0].purchase_order_id,
    to_department_name: null as string | null,
    from_department_name: null as string | null,
  };
  const distinct = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const details: ReceiptData["details"] = [];
  let headline = "";

  if (kind === "SALE") {
    headline = first.from_department_name ?? "—";
    details.push({ label: "Department", value: headline });
  } else if (kind === "REQUISITION") {
    headline = first.to_department_name ?? "—";
    details.push({ label: "From", value: first.from_department_name ?? "—" });
    details.push({ label: "To", value: headline });
    const receivers = distinct(data.map((m) => m.received_by_name));
    if (receivers.length) details.push({ label: "Received by", value: receivers.join(", ") });
  } else if (kind === "PURCHASE") {
    const suppliers = distinct([...data.map((m) => m.supplier_name), ...unstockedRows.map((u) => u.supplier_name)]);
    headline = suppliers.join(", ") || "Supplier not recorded";
    details.push({ label: "Supplier", value: headline });
    details.push({
      label: "Into",
      value: data.length === 0 ? "Not stocked — receipt only" : unstockedRows.length > 0 ? `${first.to_department_name ?? "Central store"} + items not stocked` : first.to_department_name ?? "Central store",
    });
    const invoices = distinct([...data.map((m) => m.invoice_reference), ...unstockedRows.map((u) => u.invoice_reference)]);
    if (invoices.length) details.push({ label: "Invoice / delivery note", value: invoices.join(", ") });
    const poIds = distinct([...data.map((m) => m.purchase_order_id), ...unstockedRows.map((u) => u.purchase_order_id)]);
    if (poIds.length) {
      const { data: pos } = await admin.from("purchase_orders").select("id, po_number").in("id", poIds);
      for (const p of pos ?? []) details.push({ label: "Purchase order", value: `PO-${String(p.po_number).padStart(4, "0")}`, href: `/purchase-orders/${p.id}` });
    }
  } else {
    headline = first.to_department_name ?? first.from_department_name ?? "—";
    details.push({ label: "Department", value: headline });
  }
  let createdByName = first.created_by_name;
  if (!createdByName) {
    const { data: person } = await admin.from("profiles").select("full_name").eq("id", by).maybeSingle();
    createdByName = person?.full_name ?? "—";
  }
  details.push({ label: "Entered by", value: createdByName });

  return {
    kind,
    title: TITLES[kind],
    reference: `${PREFIX[kind]}-${day.slice(2).replace(/-/g, "")}-${first.id!.slice(0, 4).toUpperCase()}`,
    businessDay: day,
    recordedAt: first.created_at!,
    createdByName,
    headline,
    details,
    valueLabel: kind === "PURCHASE" ? "Amount paid" : "Value at cost",
    showPrices,
    lines,
    totals: {
      items: lines.length,
      quantity: lines.reduce((s, l) => s + l.quantity, 0),
      amount: lines.reduce((s, l) => s + (l.amount ?? 0), 0),
    },
  };
}
