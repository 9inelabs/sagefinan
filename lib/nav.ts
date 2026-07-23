import type { UserRole } from "@/lib/auth/profile";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  roles: UserRole[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

// Mirrors design/ui-draft.html's two sidebar groups. Items are filtered per
// signed-in role before rendering — a role sees only what applies to it.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Audit",
    items: [
      { key: "dash", label: "Dashboard", href: "/", roles: ["ADMIN", "AUDITOR"] },
      { key: "count", label: "Take stock", href: "/count", roles: ["ADMIN", "AUDITOR"] },
      { key: "var", label: "Compare stock", href: "/compare", roles: ["ADMIN", "AUDITOR"] },
      { key: "sessions", label: "Sessions", href: "/sessions", roles: ["ADMIN", "AUDITOR"] },
      { key: "rec", label: "Reconcile", href: "/reconcile", roles: ["ADMIN", "AUDITOR"] },
      { key: "hist", label: "History", href: "/history", roles: ["ADMIN", "AUDITOR"] },
    ],
  },
  {
    title: "Stock control",
    items: [
      {
        key: "ledger",
        label: "Stock ledger",
        href: "/ledger",
        roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"],
      },
      {
        key: "movements",
        label: "Movements",
        href: "/movements",
        roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"],
      },
      { key: "purchases", label: "Purchases", href: "/purchases", roles: ["ADMIN", "STOREKEEPER"] },
      { key: "req", label: "Requisitions", href: "/requisitions", roles: ["ADMIN", "STOREKEEPER"] },
      { key: "sales", label: "Sales entry", href: "/sales", roles: ["ADMIN", "STOREKEEPER", "DEPARTMENT_USER"] },
      {
        key: "sales-history",
        label: "Sales history",
        href: "/sales/history",
        roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { key: "departments", label: "Departments", href: "/departments", roles: ["ADMIN"] },
      { key: "prod", label: "Products", href: "/products", roles: ["ADMIN"] },
      { key: "opening-balances", label: "Opening balances", href: "/opening-balances", roles: ["ADMIN"] },
      { key: "users", label: "Users", href: "/users", roles: ["ADMIN"] },
    ],
  },
];

export function navForRole(role: UserRole): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  STOREKEEPER: "Storekeeper",
  DEPARTMENT_USER: "Department user",
  AUDITOR: "Auditor",
};
