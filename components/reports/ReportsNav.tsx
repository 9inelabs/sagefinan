import Link from "next/link";
import type { UserRole } from "@/lib/auth/profile";

export type ReportsTab = "overview" | "sales" | "requisitions" | "purchases" | "adjustments" | "purchase-orders" | "movements" | "audit";

const TABS: { key: ReportsTab; label: string; href: string; roles: UserRole[] }[] = [
  { key: "overview", label: "Overview", href: "/reports", roles: ["ADMIN", "AUDITOR"] },
  { key: "sales", label: "Sales", href: "/sales/history", roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"] },
  { key: "requisitions", label: "Requisitions", href: "/requisitions/history", roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"] },
  { key: "purchases", label: "Purchases", href: "/reports/purchases", roles: ["ADMIN", "AUDITOR", "STOREKEEPER"] },
  { key: "purchase-orders", label: "Purchase orders", href: "/reports/purchase-orders", roles: ["ADMIN", "AUDITOR", "STOREKEEPER"] },
  { key: "adjustments", label: "Adjustments", href: "/reports/adjustments", roles: ["ADMIN", "AUDITOR"] },
  { key: "movements", label: "All movements", href: "/movements", roles: ["ADMIN", "AUDITOR", "STOREKEEPER"] },
  { key: "audit", label: "Audit reports", href: "/reconcile/reports", roles: ["ADMIN", "AUDITOR"] },
];

export function reportTabsFor(role: UserRole) {
  return TABS.filter((t) => t.roles.includes(role));
}

// The Reports section's local navigation (CLAUDE.md: "Purchase amounts,
// purchase orders, adjustments, reports") — one place for every transaction
// history. The Sales/Requisition history and Movements pages keep their own
// URLs and render this bar at the top, so old links still work.
export function ReportsNav({ active, role }: { active: ReportsTab; role: UserRole }) {
  return (
    <nav aria-label="Reports" className="-mx-1 mb-3 overflow-x-auto" data-print-hide>
      <div className="flex gap-1.5 px-1 pb-1 w-max">
        {reportTabsFor(role).map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex items-center h-8.5 px-3.5 rounded-full text-[12px] whitespace-nowrap transition-colors ${
                on ? "bg-ink text-white" : "bg-white text-ink shadow-premium hover:bg-brand-hover"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
