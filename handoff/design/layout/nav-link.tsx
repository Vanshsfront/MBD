"use client";

// Sidebar nav link — client component so the active-state pill follows
// client-side navigation. `DashboardShell` (server) renders the layout
// chrome once at sign-in; the layout is then cached by Next.js across
// in-app navigation, so a server-rendered `pathname` prop goes stale.
// Reading `usePathname()` from a client component re-evaluates on every
// route change. PRD a11y: emit aria-current="page" for screen readers.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, QrCode, UserPlus, Users, Calendar, Stethoscope, Receipt,
  CreditCard, Package, BarChart3, List, AlertTriangle, Building2, UserCog,
  Tag, History, Flag, Bell, Settings, Box, GitBranch, type LucideIcon,
} from "lucide-react";

export type NavIconKey =
  | "dashboard" | "qr" | "user-plus" | "users" | "calendar" | "stethoscope"
  | "receipt" | "credit-card" | "package" | "chart" | "list" | "alert"
  | "building" | "user-cog" | "tag" | "history" | "flag" | "bell"
  | "settings" | "box" | "hierarchy";

const NAV_ICON: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  qr: QrCode,
  "user-plus": UserPlus,
  users: Users,
  calendar: Calendar,
  stethoscope: Stethoscope,
  receipt: Receipt,
  "credit-card": CreditCard,
  package: Package,
  chart: BarChart3,
  list: List,
  alert: AlertTriangle,
  building: Building2,
  "user-cog": UserCog,
  tag: Tag,
  history: History,
  flag: Flag,
  bell: Bell,
  settings: Settings,
  box: Box,
  hierarchy: GitBranch,
};

export function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: NavIconKey;
}) {
  const pathname = usePathname() ?? "/dashboard";
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = icon ? NAV_ICON[icon] : null;
  return (
    <li>
      <Link
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          isActive
            ? "bg-[color:var(--text-primary)] font-medium text-white shadow-[0_4px_12px_-6px_rgba(26,26,30,0.4)]"
            : "text-[color:var(--text-secondary)] hover:bg-secondary hover:text-[color:var(--text-primary)]"
        }`}
      >
        {Icon ? (
          <Icon className={`h-4 w-4 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`} />
        ) : null}
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}
