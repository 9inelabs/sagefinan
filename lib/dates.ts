// Business-day default used by Sales entry and Take stock — both explicitly
// default to yesterday's close, not today, to avoid off-by-one phantom
// variances the next morning (SPEC.md).
export function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
