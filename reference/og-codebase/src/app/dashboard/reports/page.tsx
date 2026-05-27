import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Reports — MBD Clinic OS" };

const REPORTS: Array<{ href: string; label: string; description: string }> = [
  {
    href: "/dashboard/reports/mis",
    label: "MIS dashboard",
    description: "31-column daily entry log with date-range filter and CSV export.",
  },
  {
    href: "/dashboard/reports/staff",
    label: "Staff productivity",
    description: "Per-staff completed sessions, cancellations split by patient/therapist, revenue.",
  },
  {
    href: "/dashboard/reports/defaulters",
    label: "Defaulters",
    description: "Patients with frequent late cancellations. Configurable threshold.",
  },
  {
    href: "/dashboard/reports/sources",
    label: "Revenue by referral source",
    description: "Which inbound channels drive revenue.",
  },
  {
    href: "/dashboard/reports/cancellations",
    label: "Cancellations",
    description: "Cancellation analysis split by who cancelled.",
  },
];

export default async function ReportsLanding() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:view")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Five operational reports for owner / admin oversight.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>{r.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{r.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
