"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// SHARED: the current "live" opening movement per department+product — an
// OPENING-type movement that is neither itself a reversal nor yet reversed.
// Replacing one always goes through post_movement_reversal first (generic
// across every movement type already), so there is never more than one live
// entry per department+product at a time.
// ============================================================================

type LiveOpening = { movementId: string; quantity: number; businessDay: string };

async function loadLiveOpenings(admin: AdminClient, departmentId: string): Promise<Map<string, LiveOpening>> {
  const { data, error } = await admin
    .from("movements")
    .select("id, product_id, quantity, business_day, reversal_of_movement_id")
    .eq("to_department_id", departmentId)
    .eq("type", "OPENING");
  if (error) throw new Error(error.message);

  const reversedIds = new Set((data ?? []).filter((m) => m.reversal_of_movement_id).map((m) => m.reversal_of_movement_id));
  const live = new Map<string, LiveOpening>();
  for (const m of data ?? []) {
    if (m.reversal_of_movement_id) continue; // this row IS a reversal, not a live entry
    if (reversedIds.has(m.id)) continue; // this row has since been reversed
    live.set(m.product_id, { movementId: m.id, quantity: m.quantity, businessDay: m.business_day });
  }
  return live;
}

async function loadLockedAsAtDates(admin: AdminClient, departmentId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("count_sessions")
    .select("as_at_date")
    .eq("department_id", departmentId)
    .eq("status", "LOCKED");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => s.as_at_date);
}

function blockedByLock(lockedDates: string[], businessDay: string): string | null {
  const blocking = lockedDates.filter((d) => d >= businessDay).sort()[0];
  return blocking ?? null;
}

// ============================================================================
// ON-SCREEN FORM
// ============================================================================

export async function listOpeningBalanceDepartments() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { data, error } = await admin.from("departments").select("id, name, is_central_store").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type OpeningBalanceLine = {
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  currentQty: number | null; // null = no opening balance set yet
  currentBusinessDay: string | null;
  currentMovementId: string | null;
};

export async function getOpeningBalanceScreenData(
  departmentId: string
): Promise<{ lines: OpeningBalanceLine[]; missingCount: number; totalCount: number }> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { data: assignments, error } = await admin
    .from("product_assignments")
    .select("product_id, shelf_order, products(code, name, is_active)")
    .eq("department_id", departmentId);
  if (error) throw new Error(error.message);

  const live = await loadLiveOpenings(admin, departmentId);

  const lines: OpeningBalanceLine[] = (assignments ?? [])
    .filter((a) => a.products?.is_active)
    .map((a) => {
      const l = live.get(a.product_id);
      return {
        productId: a.product_id,
        code: a.products!.code,
        name: a.products!.name,
        shelfOrder: a.shelf_order,
        currentQty: l?.quantity ?? null,
        currentBusinessDay: l?.businessDay ?? null,
        currentMovementId: l?.movementId ?? null,
      };
    })
    .sort((a, b) => {
      if (a.shelfOrder == null && b.shelfOrder == null) return a.name.localeCompare(b.name);
      if (a.shelfOrder == null) return 1;
      if (b.shelfOrder == null) return -1;
      return a.shelfOrder - b.shelfOrder;
    });

  return {
    lines,
    missingCount: lines.filter((l) => l.currentQty == null).length,
    totalCount: lines.length,
  };
}

export type OpeningBalanceEntryInput = { productId: string; quantity: number };

export async function saveOpeningBalances(departmentId: string, businessDay: string, entries: OpeningBalanceEntryInput[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  if (!businessDay) throw new Error("Choose an as-at date.");
  for (const e of entries) {
    if (!Number.isInteger(e.quantity) || e.quantity < 0) {
      throw new Error("Opening quantity must be zero or a positive whole number.");
    }
  }
  if (entries.length === 0) return { written: 0 };

  const admin = createAdminClient();

  const lockedDates = await loadLockedAsAtDates(admin, departmentId);
  const blocking = blockedByLock(lockedDates, businessDay);
  if (blocking) {
    throw new Error(`Business day is locked for this department — a count session was locked certifying figures as at ${blocking}. Choose a later date.`);
  }

  const live = await loadLiveOpenings(admin, departmentId);

  // Only rows that actually change something are worth a movement — a save
  // re-submitting an unchanged prefilled value is a no-op, not a replace.
  const lines = entries
    .filter((e) => {
      const existing = live.get(e.productId);
      if (!existing) return e.quantity !== 0; // nothing existed; 0 is a no-op (absence already reads 0)
      return existing.quantity !== e.quantity;
    })
    .map((e) => {
      const existing = live.get(e.productId);
      return {
        department_id: departmentId,
        product_id: e.productId,
        business_day: businessDay,
        quantity: e.quantity,
        replace_movement_id: existing?.movementId ?? null,
      };
    });

  if (lines.length === 0) return { written: 0 };

  const { data, error } = await admin.rpc("post_opening_balances", { p_created_by: profile.id, p_lines: lines });
  if (error) throw new Error(error.message);

  revalidatePath("/opening-balances");
  return { written: data?.length ?? 0 };
}

// ============================================================================
// CSV IMPORT — same dry-run-then-confirm shape as lib/products/import.ts.
// A row whose department+product already has a live opening balance is
// flagged as "replace"; whether replace rows are actually written is a
// single up-front choice (replaceExisting) applied to the whole file, not a
// per-row prompt — impractical for a file that can carry hundreds of rows.
// ============================================================================

export type OpeningImportRowError = { row: number; reason: string };

export type OpeningImportRow = {
  row: number;
  departmentId: string;
  departmentName: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  businessDay: string;
  existingMovementId: string | null;
  existingQuantity: number | null;
  existingBusinessDay: string | null;
};

export type OpeningDryRunResult = {
  totalRows: number;
  toCreate: number;
  toReplace: number;
  noOp: number;
  errors: OpeningImportRowError[];
  validRows: OpeningImportRow[];
};

const REQUIRED_COLUMNS = ["department", "code", "name", "opening_qty", "as_at_date"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function dryRunOpeningBalanceImport(csvText: string): Promise<OpeningDryRunResult> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !parsed.meta.fields?.includes(c));
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}.`);
  }

  const admin = createAdminClient();
  const [{ data: departments }, { data: products }] = await Promise.all([
    admin.from("departments").select("id, name").eq("is_active", true),
    admin.from("products").select("id, code").eq("is_active", true),
  ]);

  const departmentByName = new Map((departments ?? []).map((d) => [d.name.trim().toLowerCase(), d]));
  const productByCode = new Map((products ?? []).map((p) => [p.code, p]));

  const { data: assignmentRows } = await admin.from("product_assignments").select("department_id, product_id");
  const assignedSet = new Set((assignmentRows ?? []).map((a) => `${a.department_id}:${a.product_id}`));

  const errors: OpeningImportRowError[] = [];
  const validRows: OpeningImportRow[] = [];
  const seenPairs = new Map<string, number>();
  const liveByDept = new Map<string, Map<string, LiveOpening>>();
  const lockedDatesByDept = new Map<string, string[]>();

  for (const e of parsed.errors) {
    errors.push({ row: (typeof e.row === "number" ? e.row : 0) + 2, reason: e.message });
  }

  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const rowNumber = i + 2;
    const departmentRaw = (raw.department ?? "").trim();
    const code = (raw.code ?? "").trim();
    const qtyRaw = (raw.opening_qty ?? "").trim();
    const dateRaw = (raw.as_at_date ?? "").trim();

    if (!departmentRaw) {
      errors.push({ row: rowNumber, reason: "Missing department." });
      continue;
    }
    const department = departmentByName.get(departmentRaw.toLowerCase());
    if (!department) {
      errors.push({ row: rowNumber, reason: `Unknown department: ${departmentRaw}.` });
      continue;
    }

    if (!code) {
      errors.push({ row: rowNumber, reason: "Missing code." });
      continue;
    }
    const product = productByCode.get(code);
    if (!product) {
      errors.push({ row: rowNumber, reason: `Unknown or inactive product code: ${code}.` });
      continue;
    }

    if (!assignedSet.has(`${department.id}:${product.id}`)) {
      errors.push({ row: rowNumber, reason: `${code} is not assigned to ${department.name} — assign it first from Products.` });
      continue;
    }

    const pairKey = `${department.id}:${product.id}`;
    if (seenPairs.has(pairKey)) {
      errors.push({ row: rowNumber, reason: `Duplicate ${department.name}/${code} — also appears in row ${seenPairs.get(pairKey)}.` });
      continue;
    }
    seenPairs.set(pairKey, rowNumber);

    const quantity = Number(qtyRaw);
    if (qtyRaw === "" || !Number.isInteger(quantity) || quantity < 0) {
      errors.push({ row: rowNumber, reason: "opening_qty must be zero or a positive whole number." });
      continue;
    }

    if (!DATE_RE.test(dateRaw) || Number.isNaN(new Date(dateRaw).getTime())) {
      errors.push({ row: rowNumber, reason: "as_at_date must be a valid date (YYYY-MM-DD)." });
      continue;
    }

    if (!lockedDatesByDept.has(department.id)) {
      lockedDatesByDept.set(department.id, await loadLockedAsAtDates(admin, department.id));
    }
    const blocking = blockedByLock(lockedDatesByDept.get(department.id)!, dateRaw);
    if (blocking) {
      errors.push({ row: rowNumber, reason: `Business day is locked for ${department.name} — a count session was locked certifying figures as at ${blocking}.` });
      continue;
    }

    if (!liveByDept.has(department.id)) {
      liveByDept.set(department.id, await loadLiveOpenings(admin, department.id));
    }
    const existing = liveByDept.get(department.id)!.get(product.id) ?? null;

    validRows.push({
      row: rowNumber,
      departmentId: department.id,
      departmentName: department.name,
      productId: product.id,
      productCode: product.code,
      productName: raw.name?.trim() || product.code,
      quantity,
      businessDay: dateRaw,
      existingMovementId: existing?.movementId ?? null,
      existingQuantity: existing?.quantity ?? null,
      existingBusinessDay: existing?.businessDay ?? null,
    });
  }

  const toCreate = validRows.filter((r) => !r.existingMovementId && r.quantity > 0).length;
  const toReplace = validRows.filter((r) => r.existingMovementId).length;
  const noOp = validRows.filter((r) => !r.existingMovementId && r.quantity === 0).length;

  return {
    totalRows: parsed.data.length,
    toCreate,
    toReplace,
    noOp,
    errors: errors.sort((a, b) => a.row - b.row),
    validRows,
  };
}

export async function commitOpeningBalanceImport(rows: OpeningImportRow[], replaceExisting: boolean) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const lines = rows
    .filter((r) => {
      if (r.existingMovementId && !replaceExisting) return false;
      if (!r.existingMovementId && r.quantity === 0) return false;
      return true;
    })
    .map((r) => ({
      department_id: r.departmentId,
      product_id: r.productId,
      business_day: r.businessDay,
      quantity: r.quantity,
      replace_movement_id: r.existingMovementId && replaceExisting ? r.existingMovementId : null,
    }));

  const skipped = rows.length - lines.length;
  if (lines.length === 0) return { written: 0, skipped };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("post_opening_balances", { p_created_by: profile.id, p_lines: lines });
  if (error) throw new Error(error.message);

  revalidatePath("/opening-balances");
  return { written: data?.length ?? 0, skipped };
}

// ============================================================================
// EXPORT — current live opening balances, one row per department+product
// that has one set.
// ============================================================================

export type OpeningBalanceExportRow = {
  departmentName: string;
  productCode: string;
  productName: string;
  quantity: number;
  businessDay: string;
};

export async function listCurrentOpeningBalances(): Promise<OpeningBalanceExportRow[]> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("movements")
    .select("quantity, business_day, reversal_of_movement_id, id, departments!movements_to_department_id_fkey(name), products(code, name)")
    .eq("type", "OPENING");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const reversedIds = new Set(rows.filter((m) => m.reversal_of_movement_id).map((m) => m.reversal_of_movement_id));

  return rows
    .filter((m) => !m.reversal_of_movement_id && !reversedIds.has(m.id))
    .map((m) => ({
      departmentName: m.departments?.name ?? "—",
      productCode: m.products?.code ?? "—",
      productName: m.products?.name ?? "—",
      quantity: m.quantity,
      businessDay: m.business_day,
    }))
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName) || a.productCode.localeCompare(b.productCode));
}
