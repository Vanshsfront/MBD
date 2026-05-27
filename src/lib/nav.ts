// MBD Clinic OS — Role-aware navigation surface (PRD §8)
//
// Source of truth for which routes each role sees in the sidebar AND which
// routes return 404 outside of that whitelist. Used by `DashboardShell` to
// render nav, and by `RoleGuard` server component on every page.

import type { Permission, Role } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  section: NavSection;
  /** Required permission to see this item. */
  permission: Permission;
  /** Optional: department-scoped routes (clinical forms). */
  department?: string;
  icon?: NavIcon;
}

export type NavSection =
  | "overview"
  | "patients"
  | "billing"
  | "reports"
  | "admin"
  | "settings";

export type NavIcon =
  | "dashboard"
  | "qr"
  | "user-plus"
  | "users"
  | "calendar"
  | "stethoscope"
  | "receipt"
  | "credit-card"
  | "package"
  | "chart"
  | "list"
  | "alert"
  | "building"
  | "user-cog"
  | "tag"
  | "history"
  | "flag"
  | "bell"
  | "settings"
  | "box"
  | "hierarchy";

export const NAV_ITEMS: readonly NavItem[] = [
  // Overview
  { label: "Dashboard", href: "/dashboard", section: "overview", permission: "dashboard:view", icon: "dashboard" },

  // Patients
  { label: "New intake (QR)", href: "/dashboard/intake", section: "patients", permission: "patients:generate_intake_qr", icon: "qr" },
  { label: "Assignment queue", href: "/dashboard/assign", section: "patients", permission: "patients:assign_therapist", icon: "user-plus" },
  { label: "Patients", href: "/dashboard/patients", section: "patients", permission: "patients:view_assigned", icon: "users" },
  { label: "Calendar", href: "/dashboard/calendar", section: "patients", permission: "appointments:view_calendar_all", icon: "calendar" },
  { label: "Sessions", href: "/dashboard/sessions", section: "patients", permission: "patients:view_assigned", icon: "stethoscope" },

  // Patients (clinical-role action)
  { label: "Raise change request", href: "/dashboard/change-requests/new", section: "patients", permission: "appointments:request_change", icon: "alert" },

  // Billing
  { label: "Invoices", href: "/dashboard/billing/invoices", section: "billing", permission: "billing:view_invoices", icon: "receipt" },
  { label: "Payments", href: "/dashboard/billing/payments", section: "billing", permission: "billing:view_payments", icon: "credit-card" },
  { label: "Packages", href: "/dashboard/billing/packages", section: "billing", permission: "billing:view_packages", icon: "package" },

  // Reports
  { label: "MIS dashboard", href: "/dashboard/reports/mis", section: "reports", permission: "reports:mis", icon: "chart" },
  { label: "Staff productivity", href: "/dashboard/reports/staff", section: "reports", permission: "reports:view", icon: "users" },
  { label: "Defaulters", href: "/dashboard/reports/defaulters", section: "reports", permission: "reports:view", icon: "alert" },
  { label: "By referral source", href: "/dashboard/reports/sources", section: "reports", permission: "reports:view", icon: "tag" },
  { label: "Cancellations", href: "/dashboard/reports/cancellations", section: "reports", permission: "reports:view", icon: "list" },

  // Admin
  { label: "Clinics", href: "/dashboard/admin/clinics", section: "admin", permission: "admin:manage_clinics", icon: "building" },
  { label: "Staff", href: "/dashboard/admin/staff", section: "admin", permission: "admin:manage_staff", icon: "user-cog" },
  { label: "Hierarchy", href: "/dashboard/admin/hierarchy", section: "admin", permission: "admin:manage_staff", icon: "hierarchy" },
  { label: "Services & rates", href: "/dashboard/admin/services", section: "admin", permission: "admin:manage_services", icon: "list" },
  { label: "Products & inventory", href: "/dashboard/admin/products", section: "admin", permission: "admin:manage_products", icon: "box" },
  { label: "Promotions", href: "/dashboard/admin/promotions", section: "admin", permission: "admin:manage_promotions", icon: "tag" },
  { label: "Referral sources", href: "/dashboard/admin/referral-sources", section: "admin", permission: "admin:manage_referral_sources", icon: "tag" },
  { label: "Audit log", href: "/dashboard/admin/audit", section: "admin", permission: "admin:audit_log", icon: "history" },
  { label: "Client flags", href: "/dashboard/admin/flags", section: "admin", permission: "admin:client_flags", icon: "flag" },
  { label: "Change requests", href: "/dashboard/admin/change-requests", section: "admin", permission: "appointments:review_change_request", icon: "bell" },

  // Settings (all roles)
  { label: "Profile", href: "/dashboard/settings/profile", section: "settings", permission: "dashboard:view", icon: "settings" },
];

import { hasPermission } from "@/lib/permissions";

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}

export function canAccessRoute(role: Role, pathname: string): boolean {
  // Settings/profile + dashboard root always allowed for any signed-in user.
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/settings")) {
    return hasPermission(role, "dashboard:view");
  }
  // Nested patient routes inherit from /dashboard/patients permission.
  if (pathname.startsWith("/dashboard/patients")) {
    return hasPermission(role, "patients:view_assigned");
  }
  // Match against the longest known nav prefix.
  const match = NAV_ITEMS
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!match) return false;
  return hasPermission(role, match.permission);
}

export function groupNav(items: NavItem[]): Record<NavSection, NavItem[]> {
  const out: Record<NavSection, NavItem[]> = {
    overview: [],
    patients: [],
    billing: [],
    reports: [],
    admin: [],
    settings: [],
  };
  for (const item of items) {
    out[item.section].push(item);
  }
  return out;
}

export const SECTION_LABELS: Record<NavSection, string> = {
  overview: "Overview",
  patients: "Patients",
  billing: "Billing",
  reports: "Reports",
  admin: "Admin",
  settings: "Settings",
};
