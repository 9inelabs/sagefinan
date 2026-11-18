import type { Database } from "@/lib/supabase/database.types";

export type MovementTypeName = Database["public"]["Enums"]["movement_type"];

// One place for every movement-type label in the UI (lists, filters,
// detail pages, receipts, reports, CSV/PDF).
export const MOVEMENT_TYPE_LABELS: Record<MovementTypeName, string> = {
  PURCHASE: "Purchase",
  REQUISITION: "Requisition",
  SALE: "Sale",
  OPENING: "Opening balance",
  ADJUSTMENT: "Adjustment",
};

// Reasons offered for a stock adjustment. Stored as text on
// movements.adjustment_category; "Other" needs the note to say why
// (every adjustment needs a note anyway).
export const ADJUSTMENT_CATEGORIES = [
  { value: "EXPIRED", label: "Expired", direction: "remove" },
  { value: "DAMAGED", label: "Damaged", direction: "remove" },
  { value: "BREAKAGE", label: "Breakage", direction: "remove" },
  { value: "LOST", label: "Lost / missing", direction: "remove" },
  { value: "STAFF_USE", label: "Staff / house use", direction: "remove" },
  { value: "FOUND", label: "Found stock", direction: "add" },
  { value: "RETURNED", label: "Returned to stock", direction: "add" },
  { value: "CORRECTION", label: "Correction", direction: "both" },
  { value: "OTHER", label: "Other", direction: "both" },
] as const;

export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number]["value"];

export function adjustmentCategoryLabel(value: string | null | undefined): string {
  return ADJUSTMENT_CATEGORIES.find((c) => c.value === value)?.label ?? value ?? "—";
}
