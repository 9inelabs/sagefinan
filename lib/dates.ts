// Business-day default used by Sales entry and Take stock — both explicitly
// default to yesterday's close, not today, to avoid off-by-one phantom
// variances the next morning (SPEC.md).
export function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Default lower bound for the Repeat variances / Period summary reports
// (phase 7) — a sensible starting window before the user picks their own
// range, same 30-day window the dashboard's own repeat-variances teaser uses.
export function thirtyDaysAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// First day of the current calendar month — Period summary's default
// starting point when the user hasn't chosen a range yet.
export function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// "Tuesday, 21 July 2026" — the dashboard header's own date, distinct from
// the business day it's reporting as-at.
export function formatLongDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// "Monday, 20 July" — used for "as at close of X" phrasing, no year (matches
// the prototype's dashboard header format).
export function formatWeekdayDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

// "27/July/2026" — the Sales/Requisition receipt's own date format, matching
// the reference image exactly (components/receipt/ReceiptView.tsx).
export function formatReceiptDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day}/${month}/${d.getFullYear()}`;
}

// "Mon, 16 Nov 2026" — compact form for the sidebar's business-day card.
export function formatShortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// "16-Nov-2026" — the purchase order's own date format, matching the
// hotel's existing paper/PDF purchase order.
export function formatPoDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${String(d.getDate()).padStart(2, "0")}-${month}-${d.getFullYear()}`;
}

// "16 Nov 2026, 14:05" — when something was recorded/actioned.
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
