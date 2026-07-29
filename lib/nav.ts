import type { UserRole } from "@/lib/auth/profile";
import {
  MessageSquare,
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Clock,
  RefreshCw,
  History,
  BookOpen,
  ArrowLeftRight,
  ShoppingBag,
  FilePlus,
  Receipt,
  ReceiptText,
  Building2,
  Package,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  roles: UserRole[];
  icon: LucideIcon;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

// Mirrors design/ui-draft.html's two sidebar groups. Items are filtered per
// signed-in role before rendering — a role sees only what applies to it.
// Icons (lucide-react, added for the premium redesign — see CLAUDE.md) are
// a plain sensible-mapping choice per item, not individually significant.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "General",
    items: [
      {
        key: "messages",
        label: "Messages",
        href: "/messages",
        roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"],
        icon: MessageSquare,
      },
    ],
  },
  {
    title: "Audit",
    items: [
      { key: "dash", label: "Dashboard", href: "/", roles: ["ADMIN", "AUDITOR"], icon: LayoutDashboard },
      { key: "count", label: "Take stock", href: "/count", roles: ["ADMIN", "AUDITOR"], icon: ClipboardList },
      { key: "var", label: "Compare stock", href: "/compare", roles: ["ADMIN", "AUDITOR"], icon: BarChart3 },
      { key: "sessions", label: "Sessions", href: "/sessions", roles: ["ADMIN", "AUDITOR"], icon: Clock },
      { key: "rec", label: "Reconcile", href: "/reconcile", roles: ["ADMIN", "AUDITOR"], icon: RefreshCw },
      { key: "hist", label: "History", href: "/history", roles: ["ADMIN", "AUDITOR"], icon: History },
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
        icon: BookOpen,
      },
      {
        key: "movements",
        label: "Movements",
        href: "/movements",
        roles: ["ADMIN", "AUDITOR", "STOREKEEPER"],
        icon: ArrowLeftRight,
      },
      { key: "purchases", label: "Purchases", href: "/purchases", roles: ["ADMIN", "STOREKEEPER"], icon: ShoppingBag },
      { key: "req", label: "Requisitions", href: "/requisitions", roles: ["ADMIN", "STOREKEEPER"], icon: FilePlus },
      {
        key: "sales",
        label: "Sales entry",
        href: "/sales",
        roles: ["ADMIN", "STOREKEEPER", "DEPARTMENT_USER"],
        icon: Receipt,
      },
      {
        key: "sales-history",
        label: "Sales history",
        href: "/sales/history",
        roles: ["ADMIN", "AUDITOR", "STOREKEEPER", "DEPARTMENT_USER"],
        icon: ReceiptText,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { key: "departments", label: "Departments", href: "/departments", roles: ["ADMIN"], icon: Building2 },
      { key: "prod", label: "Products", href: "/products", roles: ["ADMIN"], icon: Package },
      { key: "opening-balances", label: "Opening balances", href: "/opening-balances", roles: ["ADMIN"], icon: TrendingUp },
      { key: "users", label: "Users", href: "/users", roles: ["ADMIN"], icon: Users },
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
