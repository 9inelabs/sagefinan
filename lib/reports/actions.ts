"use server";

import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MovementTypeName } from "@/lib/movements/labels";

// Reports section read models (CLAUDE.md: "Purchase amounts, purchase
// orders, adjustments, reports"). Plain aggregation over movements_detail in
// application code — the same "no stored totals" approach phase 7's reports
// use. Reversals net out (negative), and adjustments split into added vs
// removed by which side of the movement the department is on.

const ROW_CAP = 20000;

type DetailRow = {
  id: string;
  type: MovementTypeName;
  business_day: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
  quantity: number;
  amount: number | null;
  unit_cost: number | null;
  supplier_name: string | null;
  invoice_reference: string | null;
  purchase_order_id: string | null;
  from_department_id: string | null;
  to_department_id: string | null;
  from_department_name: string | null;
  to_department_name: string | null;
  reversal_of_movement_id: string | null;
  product_name: string;
  product_code: string;
};

const DETAIL_COLUMNS =
  "id, type, business_day, created_at, created_by, created_by_name, quantity, amount, unit_cost, supplier_name, invoice_reference, purchase_order_id, from_department_id, to_department_id, from_department_name, to_department_name, reversal_of_movement_id, product_name, product_code";

function sign(r: DetailRow) {
  return r.reversal_of_movement_id ? -1 : 1;
}

export type OverviewBucket = { transactions: number; quantity: number; value: number };

export type RecentReceipt = {
  kind: "SALE" | "REQUISITION" | "PURCHASE" | "ADJUSTMENT";
  href: string;
  businessDay: string;
  createdAt: string;
  title: string;
  subtitle: string;
  quantity: number;
  value: number;
};

export type ReportsOverview = {
  from: string;
  to: string;
  sales: OverviewBucket;
  requisitions: OverviewBucket;
  purchases: OverviewBucket & { amountPaid: number };
  openings: OverviewBucket;
  adjustmentsRemoved: OverviewBucket;
  adjustmentsAdded: OverviewBucket;
  purchaseOrders: { pending: number; approved: number; received: number; rejected: number; approvedValue: number };
  recent: RecentReceipt[];
  capped: boolean;
};

function receiptHref(kind: RecentReceipt["kind"], r: DetailRow) {
  const sp = new URLSearchParams({ kind, day: r.business_day, by: r.created_by });
  const dept = kind === "SALE" ? r.from_department_id : kind === "REQUISITION" ? r.to_department_id : kind === "ADJUSTMENT" ? r.to_department_id ?? r.from_department_id : null;
  if (dept) sp.set("department", dept);
  return `/reports/receipt?${sp.toString()}`;
}

export async function getReportsOverview(from: string, to: string): Promise<ReportsOverview> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);
  const admin = createAdminClient();

  const [{ data, error }, { data: pos, error: poError }] = await Promise.all([
    admin.from("movements_detail").select(DETAIL_COLUMNS).gte("business_day", from).lte("business_day", to).order("created_at", { ascending: false }).limit(ROW_CAP),
    admin.from("purchase_orders").select("status, order_date, purchase_order_lines(amount)").gte("order_date", from).lte("order_date", to),
  ]);
  if (error) throw new Error(error.message);
  if (poError) throw new Error(poError.message);
  const rows = (data ?? []) as unknown as DetailRow[];

  const empty = (): OverviewBucket => ({ transactions: 0, quantity: 0, value: 0 });
  const out = {
    sales: empty(),
    requisitions: empty(),
    purchases: { ...empty(), amountPaid: 0 },
    openings: empty(),
    adjustmentsRemoved: empty(),
    adjustmentsAdded: empty(),
  };
  const groups = new Map<string, RecentReceipt>();

  for (const r of rows) {
    const s = sign(r);
    const qty = s * r.quantity;
    const value = qty * Number(r.unit_cost ?? 0);
    let bucket: OverviewBucket | null = null;
    let kind: RecentReceipt["kind"] | null = null;
    if (r.type === "SALE") {
      bucket = out.sales;
      kind = "SALE";
    } else if (r.type === "REQUISITION") {
      bucket = out.requisitions;
      kind = "REQUISITION";
    } else if (r.type === "PURCHASE") {
      bucket = out.purchases;
      kind = "PURCHASE";
      out.purchases.amountPaid += s * Number(r.amount ?? 0);
    } else if (r.type === "OPENING") bucket = out.openings;
    else if (r.type === "ADJUSTMENT") {
      bucket = r.to_department_id ? out.adjustmentsAdded : out.adjustmentsRemoved;
      kind = "ADJUSTMENT";
    }
    if (bucket) {
      bucket.transactions += 1;
      bucket.quantity += qty;
      bucket.value += value;
    }
    if (!kind) continue;

    const dept = kind === "SALE" ? r.from_department_name : kind === "REQUISITION" ? r.to_department_name : kind === "ADJUSTMENT" ? r.to_department_name ?? r.from_department_name : r.supplier_name;
    const key = `${kind}|${r.business_day}|${r.created_by}|${kind === "PURCHASE" ? "" : dept}`;
    const signedQty = kind === "ADJUSTMENT" && r.from_department_id ? -qty : qty;
    const v = kind === "PURCHASE" ? s * Number(r.amount ?? 0) : kind === "ADJUSTMENT" && r.from_department_id ? -value : value;
    const g = groups.get(key);
    if (g) {
      g.quantity += signedQty;
      g.value += v;
    } else {
      groups.set(key, {
        kind,
        href: receiptHref(kind, r),
        businessDay: r.business_day,
        createdAt: r.created_at,
        title: kind === "SALE" ? "Sales" : kind === "REQUISITION" ? "Requisition" : kind === "PURCHASE" ? "Purchase" : "Adjustment",
        subtitle: `${dept ?? "—"} · ${r.created_by_name}`,
        quantity: signedQty,
        value: v,
      });
    }
  }

  const poSummary = { pending: 0, approved: 0, received: 0, rejected: 0, approvedValue: 0 };
  for (const p of (pos ?? []) as { status: string; purchase_order_lines: { amount: number }[] }[]) {
    const total = p.purchase_order_lines.reduce((s, l) => s + Number(l.amount), 0);
    if (p.status === "PENDING") poSummary.pending++;
    if (p.status === "APPROVED") poSummary.approved++;
    if (p.status === "RECEIVED") poSummary.received++;
    if (p.status === "REJECTED") poSummary.rejected++;
    if (p.status === "APPROVED" || p.status === "RECEIVED") poSummary.approvedValue += total;
  }

  return {
    from,
    to,
    ...out,
    purchaseOrders: poSummary,
    recent: [...groups.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12),
    capped: rows.length >= ROW_CAP,
  };
}

export type PurchaseGroup = {
  href: string;
  businessDay: string;
  createdAt: string;
  createdByName: string;
  suppliers: string[];
  invoices: string[];
  hasPurchaseOrder: boolean;
  items: number;
  quantity: number;
  amountPaid: number;
  hasReversal: boolean;
};

// Purchase receipts: one per (business day, person) — the same grouping the
// receipt view uses.
export async function listPurchaseGroups(filters: { from?: string; to?: string; q?: string }): Promise<PurchaseGroup[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR", "STOREKEEPER"]);
  const admin = createAdminClient();

  let query = admin.from("movements_detail").select(DETAIL_COLUMNS).eq("type", "PURCHASE");
  if (filters.from) query = query.gte("business_day", filters.from);
  if (filters.to) query = query.lte("business_day", filters.to);
  if (filters.q?.trim()) {
    const t = filters.q.trim();
    query = query.or(`supplier_name.ilike.%${t}%,product_name.ilike.%${t}%,product_code.ilike.%${t}%,invoice_reference.ilike.%${t}%`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(ROW_CAP);
  if (error) throw new Error(error.message);

  const groups = new Map<string, PurchaseGroup>();
  for (const r of (data ?? []) as unknown as DetailRow[]) {
    const key = `${r.business_day}|${r.created_by}`;
    const s = sign(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        href: `/reports/receipt?${new URLSearchParams({ kind: "PURCHASE", day: r.business_day, by: r.created_by }).toString()}`,
        businessDay: r.business_day,
        createdAt: r.created_at,
        createdByName: r.created_by_name,
        suppliers: [],
        invoices: [],
        hasPurchaseOrder: false,
        items: 0,
        quantity: 0,
        amountPaid: 0,
        hasReversal: false,
      };
      groups.set(key, g);
    }
    g.items += 1;
    g.quantity += s * r.quantity;
    g.amountPaid += s * Number(r.amount ?? 0);
    if (r.supplier_name && !g.suppliers.includes(r.supplier_name)) g.suppliers.push(r.supplier_name);
    if (r.invoice_reference && !g.invoices.includes(r.invoice_reference)) g.invoices.push(r.invoice_reference);
    if (r.purchase_order_id) g.hasPurchaseOrder = true;
    if (r.reversal_of_movement_id) g.hasReversal = true;
  }
  return [...groups.values()];
}
