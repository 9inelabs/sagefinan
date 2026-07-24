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
