"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { hasPermission, type Permission } from "@/lib/permissions";
import {
  Users,
  ClipboardPlus,
  Stethoscope,
  CalendarDays,
  FileText,
  Package,
  BarChart3,
  Settings,
  LogOut,
  Home,
  UserPlus,
  CreditCard,
  Activity,
  Search,
  Menu,
  PieChart,
  UserCheck,
  Building2,
  MapPin,
  AlertTriangle,
  GitBranch,
  Heart,
  Sparkles,
  Dumbbell,
  ClipboardList,
  ScrollText,
  GitPullRequest,
  Boxes,
  Megaphone,
  Tags,
  Briefcase,
  Code2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { prefetchAll } from "@/hooks/use-api-cache";
import NotificationCenter from "@/components/notification-center";
import GlobalSearch from "@/components/global-search";
import ClinicSwitcher from "@/components/clinic-switcher";

// ── Nav items with permission-based visibility ──────────────────────────────
interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  permission: Permission;
  section?: string;
  // Optional department gate — show only when the signed-in staff belongs to this department.
  department?: string;
}

// ── Role-specific page access ──────────────────────────────────────────────
// FO: Overview, Client Intake, Assign, Patient Directory, Calendar
// Doctor/Therapist/Consultant: Overview, Patient Directory
// OWNER / ADMIN: only the admin console + its sub-pages for now — other
// modules are intentionally hidden until we re-enable them.
const ADMIN_ONLY_NAV = [
  "/dashboard/admin",
  "/dashboard/admin/clinics",
  "/dashboard/admin/hierarchy",
  "/dashboard/admin/staff",
  "/dashboard/admin/services",
];

// DEV role sees every page in the project. Listed explicitly (no permission gate)
// for the fastest possible iteration loop — the sidebar is the dev's directory.
const DEV_NAV: NavItem[] = [
  { title: "Overview",          href: "/dashboard",                              icon: Home,           permission: "dashboard:view",       section: "Main" },

  { title: "Client Intake",     href: "/dashboard/patients/intake",              icon: UserPlus,       permission: "patients:intake",      section: "Patients" },
  { title: "Assign",            href: "/dashboard/patients/assign",              icon: ClipboardPlus,  permission: "patients:assign",      section: "Patients" },
  { title: "Patient Directory", href: "/dashboard/patients",                     icon: Users,          permission: "patients:view",        section: "Patients" },
  { title: "FO · Intake",       href: "/dashboard/front-office/intake",          icon: UserPlus,       permission: "patients:intake",      section: "Patients" },
  { title: "FO · Assign",       href: "/dashboard/front-office/assign",          icon: ClipboardPlus,  permission: "patients:assign",      section: "Patients" },
  { title: "FO · Clients",      href: "/dashboard/front-office/clients",         icon: Users,          permission: "patients:view",        section: "Patients" },

  { title: "Calendar",          href: "/dashboard/appointments/calendar",        icon: CalendarDays,   permission: "appointments:view",    section: "Schedule" },
  { title: "Therapist Schedule",href: "/dashboard/therapist/schedule",           icon: CalendarDays,   permission: "appointments:view",    section: "Schedule" },

  { title: "Consultations",     href: "/dashboard/sessions/consultations",       icon: Stethoscope,    permission: "consultations:view",   section: "Clinical" },
  { title: "Consultation Form", href: "/dashboard/consultation",                 icon: ClipboardList,  permission: "consultations:view",   section: "Clinical" },
  { title: "Sessions",          href: "/dashboard/sessions",                     icon: Activity,       permission: "sessions:view",        section: "Clinical" },
  { title: "Therapist Sessions",href: "/dashboard/therapist/sessions",           icon: Activity,       permission: "sessions:view",        section: "Clinical" },
  { title: "Counselling",       href: "/dashboard/clinical/counselling",         icon: Heart,          permission: "clinical_notes:view",  section: "Clinical" },
  { title: "Wellness Yoga",     href: "/dashboard/clinical/yoga",                icon: Sparkles,       permission: "clinical_notes:view",  section: "Clinical" },
  { title: "Assessment (FAB)",  href: "/dashboard/clinical/fab",                 icon: Dumbbell,       permission: "clinical_notes:view",  section: "Clinical" },

  { title: "Invoices",          href: "/dashboard/billing/invoices",             icon: FileText,       permission: "invoices:view",        section: "Billing" },
  { title: "Payments",          href: "/dashboard/billing/payments",             icon: CreditCard,     permission: "payments:view",        section: "Billing" },
  { title: "Packages",          href: "/dashboard/packages",                     icon: Package,        permission: "packages:view",        section: "Billing" },

  { title: "Reports",           href: "/dashboard/reports",                      icon: BarChart3,      permission: "reports:view",         section: "Reports" },
  { title: "MIS",               href: "/dashboard/reports/mis",                  icon: PieChart,       permission: "reports:mis",          section: "Reports" },
  { title: "Staff",             href: "/dashboard/reports/staff",                icon: UserCheck,      permission: "reports:view",         section: "Reports" },
  { title: "Defaulters",        href: "/dashboard/reports/defaulters",           icon: AlertTriangle,  permission: "reports:view",         section: "Reports" },
  { title: "By Source",         href: "/dashboard/reports/sources",              icon: MapPin,         permission: "reports:view",         section: "Reports" },

  { title: "My Profile",        href: "/dashboard/settings/profile",             icon: UserCheck,      permission: "dashboard:view",       section: "Account" },

  { title: "Admin",             href: "/dashboard/admin",                        icon: Settings,       permission: "admin:staff",          section: "Admin" },
  { title: "Clinics",           href: "/dashboard/admin/clinics",                icon: Building2,      permission: "admin:clinics",        section: "Admin" },
  { title: "Hierarchy",         href: "/dashboard/admin/hierarchy",              icon: GitBranch,      permission: "admin:staff",          section: "Admin" },
  { title: "Staff",             href: "/dashboard/admin/staff",                  icon: Users,          permission: "admin:staff",          section: "Admin" },
  { title: "Services",          href: "/dashboard/admin/services",               icon: Package,        permission: "admin:services",       section: "Admin" },
  { title: "Attendance",        href: "/dashboard/admin/attendance",             icon: Briefcase,      permission: "admin:staff",          section: "Admin" },
  { title: "Audit Log",         href: "/dashboard/admin/audit",                  icon: ScrollText,     permission: "admin:audit",          section: "Admin" },
  { title: "Change Requests",   href: "/dashboard/admin/change-requests",        icon: GitPullRequest, permission: "change_requests:review", section: "Admin" },
  { title: "Flags",             href: "/dashboard/admin/flags",                  icon: AlertTriangle,  permission: "admin:flags",          section: "Admin" },
  { title: "Inventory",         href: "/dashboard/admin/inventory",              icon: Boxes,          permission: "admin:inventory",      section: "Admin" },
  { title: "Promotions",        href: "/dashboard/admin/promotions",             icon: Megaphone,      permission: "promotions:view",      section: "Admin" },
  { title: "Referral Sources",  href: "/dashboard/admin/referral-sources",       icon: Tags,           permission: "admin:referral_sources", section: "Admin" },
];

const ROLE_NAV_WHITELIST: Record<string, string[] | null> = {
  FRONT_OFFICE: [
    "/dashboard",
    "/dashboard/patients/intake",
    "/dashboard/patients/assign",
    "/dashboard/patients",
    "/dashboard/appointments/calendar",
    "/dashboard/billing/invoices",
    "/dashboard/billing/payments",
    "/dashboard/packages",
    "/dashboard/settings/profile",
  ],
  THERAPIST: [
    "/dashboard",
    "/dashboard/patients",
    "/dashboard/appointments/calendar",
    "/dashboard/clinical/counselling",
    "/dashboard/clinical/yoga",
    "/dashboard/clinical/fab",
    "/dashboard/settings/profile",
  ],
  CONSULTANT: [
    "/dashboard",
    "/dashboard/patients",
    "/dashboard/appointments/calendar",
    "/dashboard/clinical/counselling",
    "/dashboard/clinical/yoga",
    "/dashboard/clinical/fab",
    "/dashboard/settings/profile",
  ],
  OWNER: ADMIN_ONLY_NAV,
  ADMIN: ADMIN_ONLY_NAV,
  MANAGER: ADMIN_ONLY_NAV,
};

const allNavItems: NavItem[] = [
  // ── Dashboard ──
  { title: "Overview",       href: "/dashboard",                      icon: Home,         permission: "dashboard:view",       section: "Main" },

  // ── Patient Management ──
  { title: "Client Intake",  href: "/dashboard/patients/intake",      icon: UserPlus,     permission: "patients:intake",      section: "Patients" },
  { title: "Assign",         href: "/dashboard/patients/assign",      icon: ClipboardPlus,permission: "patients:assign",      section: "Patients" },
  { title: "Patient Directory", href: "/dashboard/patients",          icon: Users,        permission: "patients:view",        section: "Patients" },

  // ── Appointments & Calendar ──
  { title: "Calendar",       href: "/dashboard/appointments/calendar",icon: CalendarDays, permission: "appointments:view",    section: "Schedule" },

  // ── Clinical ──
  { title: "Consultations",  href: "/dashboard/sessions/consultations", icon: Stethoscope,permission: "consultations:view",   section: "Clinical" },
  { title: "Sessions",       href: "/dashboard/sessions",             icon: Activity,     permission: "sessions:view",        section: "Clinical" },

  // ── Per-department clinical record forms (visible only to staff in the matching department) ──
  { title: "Counselling",    href: "/dashboard/clinical/counselling", icon: Heart,        permission: "clinical_notes:edit_own", section: "Clinical", department: "Counselling" },
  { title: "Wellness Yoga",  href: "/dashboard/clinical/yoga",        icon: Sparkles,     permission: "clinical_notes:edit_own", section: "Clinical", department: "Yoga" },
  { title: "Assessment (FAB)",href: "/dashboard/clinical/fab",        icon: Dumbbell,     permission: "clinical_notes:edit_own", section: "Clinical", department: "Strength & Conditioning" },

  // ── Financial ──
  { title: "Invoices",       href: "/dashboard/billing/invoices",     icon: FileText,     permission: "invoices:view",        section: "Billing" },
  { title: "Payments",       href: "/dashboard/billing/payments",     icon: CreditCard,   permission: "payments:view",        section: "Billing" },
  { title: "Packages",       href: "/dashboard/packages",             icon: Package,      permission: "packages:view",        section: "Billing" },

  // ── Reports ──
  { title: "Reports",        href: "/dashboard/reports",              icon: BarChart3,    permission: "reports:view",         section: "Reports" },
  { title: "MIS",            href: "/dashboard/reports/mis",          icon: PieChart,     permission: "reports:mis",          section: "Reports" },
  { title: "Staff",          href: "/dashboard/reports/staff",        icon: UserCheck,    permission: "reports:view",         section: "Reports" },
  { title: "Defaulters",     href: "/dashboard/reports/defaulters",   icon: AlertTriangle,permission: "reports:view",         section: "Reports" },
  { title: "By Source",      href: "/dashboard/reports/sources",      icon: MapPin,       permission: "reports:view",         section: "Reports" },

  // ── Profile ──
  { title: "My Profile",     href: "/dashboard/settings/profile",     icon: UserCheck,    permission: "dashboard:view",       section: "Account" },

  // ── Admin — scoped down to the four features the client asked for ──
  { title: "Admin",          href: "/dashboard/admin",                icon: Settings,     permission: "admin:staff",          section: "Admin" },
  { title: "Clinics",        href: "/dashboard/admin/clinics",        icon: Building2,    permission: "admin:clinics",        section: "Admin" },
  { title: "Hierarchy",      href: "/dashboard/admin/hierarchy",      icon: GitBranch,    permission: "admin:staff",          section: "Admin" },
  { title: "Staff",          href: "/dashboard/admin/staff",          icon: Users,        permission: "admin:staff",          section: "Admin" },
  { title: "Services",       href: "/dashboard/admin/services",       icon: Package,      permission: "admin:services",       section: "Admin" },
];

function getNavItemsForRole(role: string): NavItem[] {
  // DEV: every page in the project, no filter — fastest dev iteration loop.
  if (role === "DEV") return DEV_NAV;
  const whitelist = ROLE_NAV_WHITELIST[role];
  if (whitelist === null || whitelist === undefined) {
    // Admin/Owner/Manager: filter by permission only
    return allNavItems;
  }
  // For FO, Therapist, Consultant: only show whitelisted pages
  return allNavItems.filter(item => whitelist.includes(item.href));
}

// Keep backward compat
const navItems = allNavItems;

// ── Endpoints to pre-warm in the background when dashboard first loads ───────
const PREFETCH_URLS = [
  "/api/clients",
  "/api/services",
  "/api/staff",
  "/api/staff?role=THERAPIST",
  "/api/staff?role=CONSULTANT",
  "/api/invoices",
  "/api/payments",
  "/api/sessions",
  "/api/consultations",
  "/api/packages",
  "/api/packages?status=ACTIVE",
  "/api/inventory",
  "/api/flags",
  "/api/departments",
  "/api/dashboard/stats",
];

// ── Layout ───────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    prefetchAll(PREFETCH_URLS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";
  const userDept = (session?.user as { departmentName?: string | null })?.departmentName ?? "";
  const isDev = userRole === "DEV";
  const roleNav = getNavItemsForRole(userRole);
  const filteredNav = isDev
    ? roleNav
    : roleNav.filter(
        (item) =>
          hasPermission(userRole, item.permission) &&
          // Department-gated clinical form pages: hide unless the user's department matches,
          // except for OWNER/ADMIN who can see all.
          (!item.department || item.department === userDept || userRole === "OWNER" || userRole === "ADMIN")
      );
  const currentNav = filteredNav.find((n) => n.href === pathname) ?? filteredNav[0];

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "MBD";

  // Group nav items by section for visual grouping
  const sections: { name: string; items: NavItem[] }[] = [];
  for (const item of filteredNav) {
    const sectionName = item.section || "Other";
    const existing = sections.find((s) => s.name === sectionName);
    if (existing) {
      existing.items.push(item);
    } else {
      sections.push({ name: sectionName, items: [item] });
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden font-sans antialiased">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="w-[230px] bg-surface border-r border-border-light flex flex-col py-6 z-30 flex-shrink-0">

          {/* Logo + brand name */}
          <div className="mb-6 px-5 flex items-center gap-3">
            <Link
              href="/dashboard"
              className="h-9 w-9 shrink-0 bg-text-primary rounded-xl flex items-center justify-center transition-transform hover:scale-105"
            >
              <span className="font-black text-xl tracking-tight leading-none" style={{ color: 'var(--background)' }}>M</span>
            </Link>
            <span className="text-sm font-bold text-text-primary leading-tight">
              Movement<br />
              <span className="text-text-tertiary font-medium text-[11px] tracking-wide">by Design</span>
            </span>
          </div>

          {/* Role badge */}
          <div className="mx-5 mb-5">
            <span className={cn(
              "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider",
              userRole === "DEV" ? "bg-slate-900 text-slate-50 border border-slate-700" :
              userRole === "OWNER" ? "bg-amber-50 text-amber-700 border border-amber-200/60" :
              userRole === "ADMIN" ? "bg-purple-50 text-purple-700 border border-purple-200/60" :
              userRole === "FRONT_OFFICE" ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" :
              userRole === "CONSULTANT" ? "bg-blue-50 text-blue-700 border border-blue-200/60" :
              "bg-surface-secondary text-text-secondary border border-border-light"
            )}>
              {userRole === "DEV"
                ? (<span className="inline-flex items-center gap-1"><Code2 className="h-3 w-3" /> Developer</span>)
                : userRole === "FRONT_OFFICE" ? "Front Office" : userRole.replace(/_/g, " ")}
            </span>
          </div>

          {/* Navigation with grouped sections */}
          <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto px-3 custom-scrollbar">
            {sections.map((section, sIdx) => (
              <div key={section.name}>
                {sIdx > 0 && (
                  <div className="my-2.5 mx-1 border-t border-border-light" />
                )}
                {section.name !== "Main" && (
                  <p className="text-[9px] font-semibold text-text-tertiary uppercase tracking-[0.15em] px-3 mb-1 mt-1">
                    {section.name}
                  </p>
                )}
                {section.items.map((item) => {
                  // Find the most specific nav item that matches the current pathname
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                     pathname.startsWith(item.href + "/") &&
                     // Only match if no other nav item is a more specific match
                     !filteredNav.some(
                       (other) =>
                         other.href !== item.href &&
                         other.href.startsWith(item.href) &&
                         (pathname === other.href || pathname.startsWith(other.href + "/"))
                     ));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 w-full",
                        isActive
                          ? "bg-surface-secondary text-text-primary font-semibold"
                          : "text-text-tertiary hover:bg-surface-secondary/60 hover:text-text-secondary"
                      )}
                    >
                      <Icon
                        className="h-[16px] w-[16px] shrink-0"
                        strokeWidth={isActive ? 2.5 : 1.8}
                      />
                      <span className="text-[13px] truncate">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom: sign-out + user pill */}
          <div className="mt-4 border-t border-border-light pt-4 px-3 flex flex-col gap-1">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-all duration-200 text-sm"
            >
              <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              <span>Sign Out</span>
            </button>

            <div className="flex items-center gap-3 px-3 py-2 mt-1">
              <Avatar className="h-8 w-8 shrink-0 rounded-full ring-2 ring-border-light shadow-sm">
                <AvatarImage src="" alt="Profile" />
                <AvatarFallback className="bg-text-primary text-xs font-semibold" style={{ color: 'var(--background)' }}>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">
                  {session?.user?.name ?? "User"}
                </p>
                <p className="text-[10px] text-text-tertiary truncate">
                  {(session?.user as { designation?: string })?.designation ?? userRole.replace(/_/g, " ")}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-y-auto custom-scrollbar bg-gradient-page">

          {/* Top Header */}
          <header className="h-16 px-8 lg:px-12 flex items-center justify-between sticky top-0 z-20 border-b border-border-light"
            style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center gap-4">
              <button className="lg:hidden p-2 -ml-2 text-text-tertiary hover:text-text-primary rounded-lg transition-colors">
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="font-semibold text-lg text-text-primary tracking-tight">
                {currentNav?.title ?? "Dashboard"}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group hidden sm:flex items-center">
                <Search className="absolute left-3 text-text-tertiary h-4 w-4 pointer-events-none" />
                <button
                  onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
                  className="bg-surface-secondary border border-border-light text-sm text-text-tertiary rounded-full pl-9 pr-4 py-2 w-56 text-left cursor-pointer hover:bg-surface hover:border-border transition-all duration-200"
                >
                  Search... <kbd className="ml-6 text-[10px] font-semibold bg-surface px-1.5 py-0.5 rounded border border-border-light">⌘K</kbd>
                </button>
              </div>
              <ClinicSwitcher />
              <div className="flex items-center gap-1">
                <NotificationCenter />
              </div>
            </div>
          </header>

          {/* Page content */}
          <div className="p-6 lg:p-10 max-w-[1600px] mx-auto w-full flex-1">
            {children}
            <GlobalSearch />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
