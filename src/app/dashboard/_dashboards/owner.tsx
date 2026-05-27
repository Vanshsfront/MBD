// Owner / Admin / DEV overview — Journey E entry point (PRD §4 E1).
// Revenue today/week/month + utilization + outstanding dues + quick links to
// the 5 reports + admin pages.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import type { Role } from "@/lib/permissions";

export async function OwnerDashboard({
  userName,
  role,
  centreId,
  isManagement: _isManagement,
}: {
  userName: string;
  role: Role;
  centreId: string | null;
  isManagement: boolean;
}) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const centreFilter = centreId ? { centreId } : {};

  const [revToday, revWeek, revMonth, outstanding, completedThisWeek, sessionsThisWeek, recentMis] =
    await Promise.all([
      prisma.misEntry.aggregate({
        where: { ...centreFilter, invoiceDate: { gte: startOfDay } },
        _sum: { netPayableAmount: true, paidAmount: true },
      }),
      prisma.misEntry.aggregate({
        where: { ...centreFilter, invoiceDate: { gte: startOfWeek } },
        _sum: { netPayableAmount: true, paidAmount: true },
      }),
      prisma.misEntry.aggregate({
        where: { ...centreFilter, invoiceDate: { gte: startOfMonth } },
        _sum: { netPayableAmount: true, paidAmount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          ...centreFilter,
          status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
        },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      prisma.appointment.count({
        where: {
          ...centreFilter,
          startTime: { gte: startOfWeek },
          status: "COMPLETED",
        },
      }),
      prisma.session.count({
        where: { ...centreFilter, sessionDate: { gte: startOfWeek }, status: "COMPLETED" },
      }),
      prisma.misEntry.findMany({
        where: centreFilter,
        orderBy: { invoiceDate: "desc" },
        take: 8,
      }),
    ]);

  const outstandingTotal =
    (outstanding._sum.totalAmount ?? 0) - (outstanding._sum.paidAmount ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName(userName)}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <Badge variant="outline">{role}</Badge>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueStat label="Revenue today" value={revToday._sum.netPayableAmount ?? 0} />
        <RevenueStat label="Revenue last 7 days" value={revWeek._sum.netPayableAmount ?? 0} />
        <RevenueStat label="Revenue this month" value={revMonth._sum.netPayableAmount ?? 0} />
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Outstanding dues
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {formatINR(Math.max(0, outstandingTotal))}
            </p>
            <p className="text-xs text-muted-foreground">
              {outstanding._count} unpaid invoice{outstanding._count === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent MIS entries</CardTitle>
            <Link
              href="/dashboard/reports/mis"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Open MIS
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentMis.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No MIS rows yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Patient</th>
                      <th className="px-4 py-2 text-left">Service</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentMis.map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-2 tabular-nums">
                          {m.invoiceDate.toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </td>
                        <td className="px-4 py-2">{m.patientName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{m.service ?? "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatINR(m.netPayableAmount)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatINR(m.paidAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Utilisation (last 7 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <KV k="Appointments completed" v={completedThisWeek} />
              <KV k="Sessions delivered" v={sessionsThisWeek} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <ReportLink href="/dashboard/reports/mis" label="MIS dashboard" />
              <ReportLink href="/dashboard/reports/staff" label="Staff productivity" />
              <ReportLink href="/dashboard/reports/defaulters" label="Defaulters" />
              <ReportLink href="/dashboard/reports/sources" label="By referral source" />
              <ReportLink href="/dashboard/reports/cancellations" label="Cancellations" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RevenueStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{formatINR(value)}</p>
      </CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: number | string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function ReportLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block rounded-md border px-3 py-2 hover:bg-accent">
      {label}
    </Link>
  );
}

function firstName(s: string): string {
  // Skip a leading honorific (Dr./Mr./Ms./Prof.) so "Dr. Devanshi Vira" greets
  // as "Devanshi", not "Dr.". Falls back to the full name if nothing remains.
  const parts = s.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < parts.length - 1 && /^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(parts[i]!)) i++;
  return parts[i] ?? s;
}
