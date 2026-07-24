import Link from "next/link";

const TABS = [
  { href: "/reconcile/reports", label: "Variance by reason" },
  { href: "/reconcile/reports/repeat-variances", label: "Repeat variances" },
  { href: "/reconcile/reports/period-summary", label: "Period summary" },
  { href: "/reconcile/investigation", label: "Under investigation" },
] as const;

// Shared local nav across the four report screens folded under /reconcile
// (SPEC.md phase 7's "expand /reconcile/reports into a reports hub" —
// confirmed before building, see CLAUDE.md — no new sidebar items).
export function ReportsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="flex gap-1 border-b border-n200 mb-4 overflow-x-auto">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${
            t.href === active ? "border-teal text-teal" : "border-transparent text-n600 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
