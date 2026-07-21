"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type ImportRowError = { row: number; reason: string };

export type ValidImportRow = {
  row: number;
  code: string;
  name: string;
  unitCost: number;
  departmentNames: string[];
  departmentIds: string[];
  shelfOrder: number | null;
  action: "create" | "update";
};

export type DryRunResult = {
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  errors: ImportRowError[];
  validRows: ValidImportRow[];
};

const REQUIRED_COLUMNS = ["code", "name", "unit_cost", "departments"];

// Dry run only — never writes. Parses and validates every row so the admin
// can review a full preview before anything touches the database (SPEC.md:
// "Always run a dry run first"). Department names are resolved to ids here,
// against departments that already exist — an unrecognised name is always a
// row error, never a department created on the fly.
export async function dryRunImportProducts(csvText: string): Promise<DryRunResult> {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  const missingColumns = REQUIRED_COLUMNS.filter((c) => !parsed.meta.fields?.includes(c));
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required column${missingColumns.length > 1 ? "s" : ""}: ${missingColumns.join(", ")}.`);
  }

  const admin = createAdminClient();
  const [{ data: departments }, { data: existingProducts }] = await Promise.all([
    admin.from("departments").select("id, name"),
    admin.from("products").select("code"),
  ]);

  const departmentByName = new Map((departments ?? []).map((d) => [d.name.trim().toLowerCase(), d]));
  const existingCodes = new Set((existingProducts ?? []).map((p) => p.code));

  const errors: ImportRowError[] = [];
  const validRows: ValidImportRow[] = [];
  const seenCodes = new Map<string, number>();

  for (const e of parsed.errors) {
    errors.push({ row: (typeof e.row === "number" ? e.row : 0) + 2, reason: e.message });
  }

  parsed.data.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const code = (raw.code ?? "").trim();
    const name = (raw.name ?? "").trim();
    const unitCostRaw = (raw.unit_cost ?? "").trim();
    const departmentsRaw = (raw.departments ?? "").trim();
    const shelfOrderRaw = (raw.shelf_order ?? "").trim();

    if (!code) {
      errors.push({ row: rowNumber, reason: "Missing code." });
      return;
    }
    if (!name) {
      errors.push({ row: rowNumber, reason: "Missing name." });
      return;
    }
    if (seenCodes.has(code)) {
      errors.push({ row: rowNumber, reason: `Duplicate code — also appears in row ${seenCodes.get(code)}.` });
      return;
    }
    seenCodes.set(code, rowNumber);

    const unitCost = Number(unitCostRaw);
    if (unitCostRaw === "" || !Number.isFinite(unitCost)) {
      errors.push({ row: rowNumber, reason: "unit_cost must be a number." });
      return;
    }
    if (unitCost < 0) {
      errors.push({ row: rowNumber, reason: "unit_cost cannot be negative." });
      return;
    }

    let shelfOrder: number | null = null;
    if (shelfOrderRaw !== "") {
      const n = Number(shelfOrderRaw);
      if (!Number.isInteger(n) || n < 0) {
        errors.push({ row: rowNumber, reason: "shelf_order must be a whole number of zero or more." });
        return;
      }
      shelfOrder = n;
    }

    const departmentNames = departmentsRaw
      ? departmentsRaw
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const departmentIds: string[] = [];
    const unknown: string[] = [];
    for (const dName of departmentNames) {
      const match = departmentByName.get(dName.toLowerCase());
      if (match) departmentIds.push(match.id);
      else unknown.push(dName);
    }
    if (unknown.length > 0) {
      errors.push({ row: rowNumber, reason: `Unknown department${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.` });
      return;
    }

    validRows.push({
      row: rowNumber,
      code,
      name,
      unitCost,
      departmentNames,
      departmentIds,
      shelfOrder,
      action: existingCodes.has(code) ? "update" : "create",
    });
  });

  return {
    totalRows: parsed.data.length,
    toCreate: validRows.filter((r) => r.action === "create").length,
    toUpdate: validRows.filter((r) => r.action === "update").length,
    errors: errors.sort((a, b) => a.row - b.row),
    validRows,
  };
}

// Commit step — only ever called with rows the dry run already validated.
// admin_import_products() runs as one function call, i.e. one implicit
// transaction: an exception partway through rolls back everything.
export async function commitImportProducts(rows: ValidImportRow[]) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  if (rows.length === 0) return { created: 0, updated: 0 };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_import_products", {
    p_rows: rows.map((r) => ({
      code: r.code,
      name: r.name,
      unit_cost: r.unitCost,
      shelf_order: r.shelfOrder,
      department_ids: r.departmentIds,
    })),
  });
  if (error) throw new Error(error.message);

  const created = (data ?? []).filter((r) => r.action === "created").length;
  const updated = (data ?? []).filter((r) => r.action === "updated").length;

  revalidatePath("/products");
  return { created, updated };
}
