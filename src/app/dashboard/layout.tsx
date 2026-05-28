import { DashboardShell } from "@/components/layout/dashboard-shell";

// The sidebar's active-state is derived inside NavLink (a client component
// reading usePathname). Earlier this layout passed a pathname prop sourced
// from request headers — that went stale because App Router caches layouts
// across client navigation. The shell is now self-contained.

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
