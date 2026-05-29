// Reports landing — Journey E entry point.
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/reports-misc.jsx — Reports). 5-tile card grid with eyebrow,
// label, hint and chevron, replacing the prior 2-col plain-card grid.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Users, AlertTriangle, Compass, CalendarX } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Reports — MBD Clinic OS" };

const REPORTS: Array<{
  href: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    href: "/dashboard/reports/mis",
    label: "MIS dashboard",
    hint: "Compliance ledger · 31-column daily entry log",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    href: "/dashboard/reports/staff",
    label: "Staff productivity",
    hint: "Completed sessions and revenue by therapist",
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: "/dashboard/reports/defaulters",
    label: "Defaulters",
    hint: "Patients with frequent late cancellations",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  {
    href: "/dashboard/reports/sources",
    label: "By referral source",
    hint: "Which inbound channels drive revenue",
    icon: <Compass className="h-4 w-4" />,
  },
  {
    href: "/dashboard/reports/cancellations",
    label: "Cancellations",
    hint: "Cancellation analysis split by who cancelled",
    icon: <CalendarX className="h-4 w-4" />,
  },
];

export default async function ReportsLanding() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "reports:view")) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Reports</p>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Five operational reports for owner / admin oversight.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href} className="block">
            <Card className="h-full p-5 transition-shadow hover:shadow-[0_1px_2px_0_var(--shadow-color),0_8px_24px_-10px_var(--shadow-color-strong)]">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-[color:var(--primary)]"
                >
                  {r.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.label}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-tertiary)]">{r.hint}</p>
                </div>
                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-tertiary)]"
                  aria-hidden
                />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
