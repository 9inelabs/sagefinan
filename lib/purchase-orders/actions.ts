"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

// Purchase orders (see CLAUDE.md's "Purchase amounts, purchase orders,
// adjustments, reports" entry). The storekeeper raises one, an admin approves
// or rejects it, an approved PO downloads as a PDF, and when goods arrive the
// storekeeper receives it on the Purchases screen (lines linked to a product
// prefilled) — which marks it RECEIVED inside post_purchase_batch.

export type PurchaseOrderStatus = Database["public"]["Enums"]["purchase_order_status"];

export type PurchaseOrderLine = {
  lineNo: number;
  description: string;
  quantityText: string | null;
  amount: number | null; // null = not priced yet (the approver fills it in)
  productId: string | null;
  productCode: string | null;
  productName: string | null;
};

export type PurchaseOrderSummary = {
  id: string;
  poNumber: number;
  orderDate: string;
  supplierName: string | null;
  status: PurchaseOrderStatus;
  total: number;
  lineCount: number;
  unpricedCount: number;
  createdById: string;
  createdByName: string;
  createdAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type PurchaseOrderDetail = PurchaseOrderSummary & {
  notes: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  receivedAt: string | null;
  // Set when an admin edited the order while it was approved (it stayed approved).
  amendedByName: string | null;
  amendedAt: string | null;
  lines: PurchaseOrderLine[];
  // Where the goods-received purchase lives, once received.
  receipt: { businessDay: string; createdBy: string } | null;
};

const READ_ROLES = ["ADMIN", "AUDITOR", "STOREKEEPER"] as const;

const PO_SELECT = `
  id, po_number, order_date, supplier_name, notes, status, created_at, created_by,
  approved_at, rejected_at, rejection_reason, received_at, amended_at,
  creator:profiles!purchase_orders_created_by_fkey(full_name),
  approver:profiles!purchase_orders_approved_by_fkey(full_name),
  rejecter:profiles!purchase_orders_rejected_by_fkey(full_name),
  amender:profiles!purchase_orders_amended_by_fkey(full_name),
  purchase_order_lines(line_no, description, quantity_text, amount, product_id, products(code, name))
`;

type PoRow = {
  id: string;
  po_number: number;
  order_date: string;
  supplier_name: string | null;
  notes: string | null;
  status: PurchaseOrderStatus;
  created_at: string;
  created_by: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  received_at: string | null;
  amended_at: string | null;
  creator: { full_name: string } | null;
  approver: { full_name: string } | null;
  rejecter: { full_name: string } | null;
  amender: { full_name: string } | null;
  purchase_order_lines: {
    line_no: number;
    description: string;
    quantity_text: string | null;
    amount: number | null;
    product_id: string | null;
    products: { code: string; name: string } | null;
  }[];
};

function toLines(row: PoRow): PurchaseOrderLine[] {
  return [...row.purchase_order_lines]
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({
      lineNo: l.line_no,
      description: l.description,
      quantityText: l.quantity_text,
      amount: l.amount == null ? null : Number(l.amount),
      productId: l.product_id,
      productCode: l.products?.code ?? null,
      productName: l.products?.name ?? null,
    }));
}

function toSummary(row: PoRow): PurchaseOrderSummary {
  const lines = toLines(row);
  return {
    id: row.id,
    poNumber: row.po_number,
    orderDate: row.order_date,
    supplierName: row.supplier_name,
    status: row.status,
    total: lines.reduce((s, l) => s + (l.amount ?? 0), 0),
    lineCount: lines.length,
    unpricedCount: lines.filter((l) => l.amount == null).length,
    createdById: row.created_by,
    createdByName: row.creator?.full_name ?? "—",
    createdAt: row.created_at,
    approvedByName: row.approver?.full_name ?? null,
    approvedAt: row.approved_at,
  };
}

export async function listPurchaseOrders(filters: { status?: PurchaseOrderStatus | ""; from?: string; to?: string; q?: string } = {}) {
  const profile = await getCurrentProfile();
  requireRole(profile, [...READ_ROLES]);
  const admin = createAdminClient();

  let query = admin.from("purchase_orders").select(PO_SELECT);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("order_date", filters.from);
  if (filters.to) query = query.lte("order_date", filters.to);
  if (filters.q?.trim()) query = query.ilike("supplier_name", `%${filters.q.trim()}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PoRow[]).map(toSummary);
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  const profile = await getCurrentProfile();
  requireRole(profile, [...READ_ROLES]);
  const admin = createAdminClient();

  const { data, error } = await admin.from("purchase_orders").select(PO_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as PoRow;

  let receipt: PurchaseOrderDetail["receipt"] = null;
  if (row.status === "RECEIVED") {
    const { data: mv } = await admin
      .from("movements")
      .select("business_day, created_by")
      .eq("purchase_order_id", id)
      .is("reversal_of_movement_id", null)
      .limit(1)
      .maybeSingle();
    if (mv) receipt = { businessDay: mv.business_day, createdBy: mv.created_by };
  }

  return {
    ...toSummary(row),
    notes: row.notes,
    rejectedByName: row.rejecter?.full_name ?? null,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    receivedAt: row.received_at,
    amendedByName: row.amender?.full_name ?? null,
    amendedAt: row.amended_at,
    lines: toLines(row),
    receipt,
  };
}

export type PurchaseOrderLineInput = {
  description: string;
  quantityText: string;
  amount: number | null; // null = leave for the approver to price
  productId: string | null;
};

export async function savePurchaseOrder(input: {
  id?: string | null;
  orderDate: string;
  supplierName: string;
  notes: string;
  lines: PurchaseOrderLineInput[];
}) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  if (!input.orderDate) throw new Error("Choose the order date.");
  const lines = input.lines.filter((l) => l.description.trim() !== "" || (l.amount ?? 0) > 0 || l.quantityText.trim() !== "");
  if (lines.length === 0) throw new Error("Add at least one item.");
  for (const [i, l] of lines.entries()) {
    if (!l.description.trim()) throw new Error(`Item ${i + 1} needs a description.`);
    if (l.amount != null && (!Number.isFinite(l.amount) || l.amount < 0)) throw new Error(`Item ${i + 1}'s price must be zero or more.`);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("save_purchase_order", {
    // null creates a new PO (the generated type marks the arg non-null since it has no SQL default)
    p_id: (input.id ?? null) as unknown as string,
    p_order_date: input.orderDate,
    p_supplier_name: input.supplierName,
    p_notes: input.notes,
    p_user: profile.id,
    p_lines: lines.map((l) => ({
      description: l.description.trim(),
      quantity_text: l.quantityText.trim(),
      amount: l.amount == null ? "" : Math.round(l.amount * 100) / 100,
      product_id: l.productId ?? "",
    })),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/purchase-orders");
  revalidatePath("/reports");
  return { id: data as string };
}

// Refused while any line is unpriced (approve_purchase_order re-checks it
// in the same transaction as the status change).
export async function approvePurchaseOrder(id: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);
  const admin = createAdminClient();

  const { error } = await admin.rpc("approve_purchase_order", { p_id: id, p_user: profile.id });
  if (error) throw new Error(error.message);

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/", "layout");
}

export async function rejectPurchaseOrder(id: string, reason: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("Say why this purchase order is being rejected.");
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("purchase_orders")
    .update({
      status: "REJECTED",
      rejected_by: profile.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Only a pending purchase order can be rejected — it may already have been actioned.");

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/", "layout");
}

// Withdraw a PO that was never approved. Approved/received POs stay forever
// as part of the record.
export async function deletePurchaseOrder(id: string) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);
  const admin = createAdminClient();

  const { data, error } = await admin.from("purchase_orders").delete().eq("id", id).in("status", ["PENDING", "REJECTED"]).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Only a pending or rejected purchase order can be withdrawn.");

  revalidatePath("/purchase-orders");
  revalidatePath("/", "layout");
}

// Sidebar badge for admins: how many POs are waiting on them.
export async function getPendingPurchaseOrderCount(): Promise<number> {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return 0;
  const admin = createAdminClient();
  const { count, error } = await admin.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "PENDING");
  if (error) return 0;
  return count ?? 0;
}

export type ReceivablePurchaseOrder = {
  id: string;
  poNumber: number;
  supplierName: string | null;
  lines: {
    productId: string;
    code: string;
    name: string;
    description: string;
    quantityText: string | null;
    amount: number;
    currentQty: number;
  }[];
  unlinkedLines: { description: string; quantityText: string | null; amount: number }[];
};

// The Purchases screen's "receive this PO" prefill: only lines linked to a
// product can become stock; the rest (fresh food, diesel…) are listed so the
// storekeeper sees what isn't being stocked.
export async function getReceivablePurchaseOrder(id: string): Promise<ReceivablePurchaseOrder | null> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);
  const po = await getPurchaseOrder(id);
  if (!po || po.status !== "APPROVED") return null;

  const admin = createAdminClient();
  const productIds = po.lines.map((l) => l.productId).filter((x): x is string => !!x);
  const balanceByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: central } = await admin.from("departments").select("id").eq("is_central_store", true).maybeSingle();
    if (central) {
      const { data: balances } = await admin.rpc("get_department_balance", {
        p_department_id: central.id,
        p_as_at_date: new Date().toISOString().slice(0, 10),
        p_product_ids: productIds,
      });
      for (const b of balances ?? []) balanceByProduct.set(b.product_id, b.closing_qty);
    }
  }

  return {
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplierName,
    lines: po.lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId!,
        code: l.productCode ?? "",
        name: l.productName ?? l.description,
        description: l.description,
        quantityText: l.quantityText,
        amount: l.amount ?? 0, // an approved order is always fully priced
        // Not yet stocked by the central store reads 0 — posting the purchase
        // assigns it there (post_purchase_batch).
        currentQty: balanceByProduct.get(l.productId!) ?? 0,
      })),
    unlinkedLines: po.lines.filter((l) => !l.productId).map((l) => ({ description: l.description, quantityText: l.quantityText, amount: l.amount ?? 0 })),
  };
}
