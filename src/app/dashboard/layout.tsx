import { headers } from "next/headers";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/dashboard";
  return <DashboardShell pathname={pathname}>{children}</DashboardShell>;
}
