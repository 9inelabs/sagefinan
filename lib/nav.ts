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
      { key: "req", label: "Requisitions", href: "/requisitions", roles: ["ADMIN", "STOREKEEPER"] },
      { key: "sales", label: "Sales entry", href: "/sales", roles: ["ADMIN", "DEPARTMENT_USER"] },
      { key: "prod", label: "Products", href: "/products", roles: ["ADMIN"] },
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
