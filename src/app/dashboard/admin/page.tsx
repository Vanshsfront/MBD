import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Permission } from "@/lib/permissions";

export const metadata = { title: "Admin — MBD Clinic OS" };

const SECTIONS: Array<{
  href: string;
  label: string;
  description: string;
  permission: Permission;
}> = [
  { href: "/dashboard/admin/clinics", label: "Clinics", description: "Manage centres and copy services/products to a new clinic.", permission: "admin:manage_clinics" },
  { href: "/dashboard/admin/staff", label: "Staff", description: "Activate / deactivate staff and reset passwords.", permission: "admin:manage_staff" },
  { href: "/dashboard/admin/services", label: "Services", description: "Edit prices and GST rates for billable services.", permission: "admin:manage_services" },
  { href: "/dashboard/admin/products", label: "Products & inventory", description: "Stock-in, supplier, sell price.", permission: "admin:manage_products" },
  { href: "/dashboard/admin/promotions", label: "Promotions", description: "Promo codes — Senior, Festival, Referral, etc.", permission: "admin:manage_promotions" },
  { href: "/dashboard/admin/referral-sources", label: "Referral sources", description: "Channel taxonomy (Google, Walk-in, Doctor referral, …).", permission: "admin:manage_referral_sources" },
  { href: "/dashboard/admin/audit", label: "Audit log", description: "Full mutation history.", permission: "admin:audit_log" },
  { href: "/dashboard/admin/flags", label: "Client flags", description: "VIP / Caution / etc.", permission: "admin:client_flags" },
  { href: "/dashboard/admin/change-requests", label: "Change requests", description: "Review clinician reschedule / reassign requests.", permission: "appointments:review_change_request" },
];

export default async function AdminLanding() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  const allowed = SECTIONS.filter((s) => hasAnyPermission(role, [s.permission]));
  if (allowed.length === 0) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Configuration + oversight surfaces.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {allowed.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{s.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
