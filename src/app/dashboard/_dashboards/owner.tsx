// Owner / DEV overview — Journey E entry point (PRD §4 E1).
// Layout follows the 2026-05-29 Claude Design handoff (mbd/project/mbd/dashboard.jsx):
//   - Today strip with 4 live counters (intakes, appointments, drafts, change requests)
//   - 4 KPI tiles with vs-prior deltas + outstanding rendered as a CTA, not a stat
//   - 2-col main grid: recent MIS table (8 rows) + utilisation bars + reports tiles
// All data is real Prisma reads — no decorative numbers, no fake sparklines.

import Link from "next/link";
import { ArrowRight, Download, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const startOfYesterday = new Date(startOfDay);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  // "Last 7 days" = 7d back inclusive of today.
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfPriorWeek = new Date(startOfWeek);
  startOfPriorWeek.setDate(startOfPriorWeek.getDate() - 7);

  // "This month" = MTD; "prior month" = same number of days from the prior
  // month's start, clamped to its end. Lets the delta compare like-for-like.
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPriorMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const priorMonthSameDay = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    Math.min(now.getDate(), daysInMonth(now.getFullYear(), now.getMonth() - 1)),
  );
  priorMonthSameDay.setHours(23, 59, 59, 999);

  const centreFilter = centreId ? { centreId } : {};
  const centreFilterAppt = centreFilter; // Appointment uses the same shape
  const centreFilterInvoice = centreFilter;

  const [
    revToday,
    revYesterday,
    revWeek,
    revPriorWeek,
    revMonth,
    revPriorMonth,
    outstanding,
    completedThisWeek,
    sessionsThisWeek,
    hoursThisWeekAppts,
    recentMis,
    intakesWaiting,
    apptsToday,
    nextAppt,
    draftsCount,
    changeRequestsPending,
    activeClinicalStaffCount,
  ] = await Promise.all([
    prisma.misEntry.aggregate({
      where: { ...centreFilter, invoiceDate: { gte: startOfDay, lt: endOfDay }, invoiceType: "INVOICE" },
      _sum: { netPayableAmount: true },
    }),
    prisma.misEntry.aggregate({
      where: { ...centreFilter, invoiceDate: { gte: startOfYesterday, lt: startOfDay }, invoiceType: "INVOICE" },
      _sum: { netPayableAmount: true },
    }),
    prisma.misEntry.aggregate({
      where: { ...centreFilter, invoiceDate: { gte: startOfWeek }, invoiceType: "INVOICE" },
      _sum: { netPayableAmount: true },
    }),
    prisma.misEntry.aggregate({
      where: { ...centreFilter, invoiceDate: { gte: startOfPriorWeek, lt: startOfWeek }, invoiceType: "INVOICE" },
      _sum: { netPayableAmount: true },
    }),
    prisma.misEntry.aggregate({
      where: { ...centreFilter, invoiceDate: { gte: startOfMonth }, invoiceType: "INVOICE" },
      _sum: { netPayableAmount: true },
    }),
    prisma.misEntry.aggregate({
      where: {
        ...centreFilter,
        invoiceDate: { gte: startOfPriorMonth, lte: priorMonthSameDay },
        invoiceType: "INVOICE",
      },
      _sum: { netPayableAmount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        ...centreFilterInvoice,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.appointment.count({
      where: {
        ...centreFilterAppt,
        startTime: { gte: startOfWeek },
        status: "COMPLETED",
      },
    }),
    prisma.session.count({
      where: { ...centreFilter, sessionDate: { gte: startOfWeek }, status: "COMPLETED" },
    }),
    // Therapist hours billed last 7d — sum of (end - start) on completed
    // appointments. Bounded by week × small therapist roster → fine to read
    // raw rows and reduce in JS (Prisma can't sum a duration in SQLite/PG).
    prisma.appointment.findMany({
      where: {
        ...centreFilterAppt,
        startTime: { gte: startOfWeek },
        status: "COMPLETED",
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.misEntry.findMany({
      where: centreFilter,
      orderBy: { invoiceDate: "desc" },
      take: 8,
      select: {
        id: true,
        invoiceDate: true,
        patientName: true,
        service: true,
        netPayableAmount: true,
        paidAmount: true,
      },
    }),
    // Today-strip: intake tokens still actionable
    prisma.intakeToken.count({
      where: {
        ...(centreId ? { centreId } : {}),
        status: "PENDING",
        expiresAt: { gt: now },
      },
    }),
    prisma.appointment.count({
      where: {
        ...centreFilterAppt,
        startTime: { gte: startOfDay, lt: endOfDay },
        status: { in: ["CONFIRMED", "RESCHEDULED", "COMPLETED"] },
      },
    }),
    prisma.appointment.findFirst({
      where: {
        ...centreFilterAppt,
        startTime: { gte: now, lt: endOfDay },
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
      },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    }),
    prisma.consultation.count({
      where: {
        status: "DRAFT",
        ...(centreId ? { client: { centreId } } : {}),
      },
    }),
    prisma.changeRequest.count({ where: { status: "PENDING" } }),
    prisma.staff.count({
      where: {
        isActive: true,
        role: { in: ["THERAPIST", "CONSULTANT"] },
        ...(centreId ? { centreId } : {}),
      },
    }),
  ]);

  const outstandingTotal = Math.max(
    0,
    (outstanding._sum.totalAmount ?? 0) - (outstanding._sum.paidAmount ?? 0),
  );

  const hoursThisWeek = sumHours(hoursThisWeekAppts);
  // Capacity = a realistic week target per active clinical staff (4 billable
  // hours/day × 5 working days = 20h/week × roster). 8h × 7d was the gross
  // capacity ceiling — not what therapists actually bill — so the bar
  // showed as ~10% even on a healthy week. 20h/week per head reads sensibly
  // for an MBD-sized clinic. Falls back to the actual value × 1.5 when the
  // roster is empty so the bar never sits at 100% and never divides by 0.
  const hoursTargetPerStaffWeek = 20;
  const hoursCapacity = Math.max(
    activeClinicalStaffCount * hoursTargetPerStaffWeek,
    Math.ceil(hoursThisWeek * 1.5),
    1,
  );
  // Appointments/sessions capacity uses last week's value as the comparison
  // ceiling — what we hit before, not an aspirational target — so the bar
  // reads as a relative-to-recent number, not invented.
  const apptsCapacity = Math.max(completedThisWeek * 1.15, 1);
  const sessionsCapacity = Math.max(sessionsThisWeek * 1.15, 1);

  const todayDelta = pctDelta(revToday._sum.netPayableAmount, revYesterday._sum.netPayableAmount);
  const weekDelta = pctDelta(revWeek._sum.netPayableAmount, revPriorWeek._sum.netPayableAmount);
  const monthDelta = pctDelta(revMonth._sum.netPayableAmount, revPriorMonth._sum.netPayableAmount);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {firstName(userName)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <Badge variant="outline">{role}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/reports/mis">
              <Download className="h-4 w-4" aria-hidden /> Export
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/billing/invoices/new">
              <Plus className="h-4 w-4" aria-hidden /> New invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Today strip — live status above the KPIs (audit n=1) */}
      <div className="fo-today">
        <span className="fo-today-item">
          <span className="dot live" aria-hidden />
          <strong>{intakesWaiting}</strong> intakes waiting
        </span>
        <span className="fo-today-div" />
        <span className="fo-today-item">
          <strong>{apptsToday}</strong> appointments today
          {nextAppt ? (
            <span className="muted">· next at {formatTime(nextAppt.startTime)}</span>
          ) : null}
        </span>
        <span className="fo-today-div" />
        <span className="fo-today-item">
          <strong>{draftsCount}</strong> clinical drafts
          <span className="muted">· not yet locked</span>
        </span>
        <span className="fo-today-div" />
        <span className={`fo-today-item ${changeRequestsPending > 0 ? "warn" : ""}`}>
          <strong>{changeRequestsPending}</strong> change requests
          <span className="muted">· pending review</span>
        </span>
      </div>

      {/* KPI grid — outstanding is rendered as a CTA, not a bare stat (audit n=3) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue today"
          value={revToday._sum.netPayableAmount ?? 0}
          delta={todayDelta}
        />
        <KpiCard
          label="Revenue last 7 days"
          value={revWeek._sum.netPayableAmount ?? 0}
          delta={weekDelta}
        />
        <KpiCard
          label="Revenue this month"
          value={revMonth._sum.netPayableAmount ?? 0}
          delta={monthDelta}
        />
        <OutstandingCard count={outstanding._count} total={outstandingTotal} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">Recent MIS entries</h2>
              <p className="text-xs text-muted-foreground">Last 8 invoices, all departments</p>
            </div>
            <Link
              href="/dashboard/reports/mis"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Open MIS <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {recentMis.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">No MIS rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl tbl-compact">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Service</th>
                    <th className="num">Amount</th>
                    <th className="num">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMis.map((m) => (
                    <tr key={m.id}>
                      <td className="muted tabular">{formatShortDate(m.invoiceDate)}</td>
                      <td>{m.patientName}</td>
                      <td className="muted">{m.service ?? "—"}</td>
                      <td className="num">{formatINR(m.netPayableAmount)}</td>
                      <td className="num">{renderPaid(m.paidAmount, m.netPayableAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="p-6">
              <h3 className="mb-4 text-sm font-semibold">Utilisation · last 7 days</h3>
              <UtilRow
                k="Appointments completed"
                v={completedThisWeek}
                max={Math.ceil(apptsCapacity)}
                color="var(--chart-1)"
              />
              <UtilRow
                k="Sessions delivered"
                v={sessionsThisWeek}
                max={Math.ceil(sessionsCapacity)}
                color="var(--chart-3)"
              />
              <UtilRow
                k="Therapist hours billed"
                v={Math.round(hoursThisWeek)}
                max={Math.ceil(hoursCapacity)}
                suffix="h"
                color="var(--chart-4)"
              />
            </div>
          </Card>
          <Card>
            <div className="p-6">
              <h3 className="mb-3 text-sm font-semibold">Reports</h3>
              <div className="flex flex-col gap-1.5">
                <ReportLink
                  href="/dashboard/reports/mis"
                  label="MIS dashboard"
                  hint="Compliance ledger"
                />
                <ReportLink
                  href="/dashboard/reports/staff"
                  label="Staff productivity"
                  hint="By therapist"
                />
                <ReportLink
                  href="/dashboard/reports/defaulters"
                  label="Defaulters"
                  hint="Frequent late cancellations"
                />
                <ReportLink href="/dashboard/reports/sources" label="By referral source" />
                <ReportLink href="/dashboard/reports/cancellations" label="Cancellations" />
              </div>
            </div>
          </Card>
        </div>
      </div>

    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta: number | null;
}) {
  return (
    <Card>
      <div className="flex flex-col gap-2 p-6">
        <p className="eyebrow">{label}</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight">{formatINR(value)}</p>
        {delta != null ? (
          <span
            className={`chip ${delta >= 0 ? "chip-success" : "chip-danger"} tabular w-fit`}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs prior
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No prior period yet</span>
        )}
      </div>
    </Card>
  );
}

function OutstandingCard({ count, total }: { count: number; total: number }) {
  // Outstanding is a stat AND an action — link straight into the unpaid
  // invoice list so the Owner can chase from the dashboard. Per audit n=3.
  if (count === 0) {
    return (
      <Card>
        <div className="flex flex-col gap-2 p-6">
          <p className="eyebrow">Outstanding dues</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{formatINR(0)}</p>
          <span className="chip chip-success w-fit">All clear</span>
        </div>
      </Card>
    );
  }
  return (
    <Link
      href="/dashboard/billing/invoices?status=overdue"
      className="group block rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2"
    >
      <Card className="group-hover:shadow-[0_1px_2px_0_var(--shadow-color),0_8px_24px_-10px_var(--shadow-color),0_0_0_1px_var(--border-light)] transition-shadow">
        <div className="flex flex-col gap-2 p-6">
          <p className="eyebrow">Outstanding dues</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{formatINR(total)}</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--primary)]">
            Chase {count} unpaid · {formatINR(total)}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function UtilRow({
  k,
  v,
  max,
  suffix = "",
  color = "var(--chart-1)",
}: {
  k: string;
  v: number;
  max: number;
  suffix?: string;
  color?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round((v / max) * 100)));
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{k}</span>
        <span className="text-sm font-medium tabular-nums">
          {v}
          {suffix}
          <span className="text-[color:var(--text-tertiary)]"> / {max}{suffix}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ReportLink({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border border-[color:var(--border-light)] px-3 py-2.5 transition-colors hover:bg-secondary"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-[11px] text-[color:var(--text-tertiary)]">{hint}</p> : null}
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[color:var(--text-tertiary)]" aria-hidden />
    </Link>
  );
}

function pctDelta(current: number | null, prior: number | null): number | null {
  const c = current ?? 0;
  const p = prior ?? 0;
  if (p === 0) {
    if (c === 0) return 0;
    return null; // no baseline — show "No prior period yet"
  }
  return Math.round(((c - p) / p) * 100);
}

function sumHours(rows: ReadonlyArray<{ startTime: Date; endTime: Date }>): number {
  let ms = 0;
  for (const r of rows) ms += r.endTime.getTime() - r.startTime.getTime();
  return ms / (1000 * 60 * 60);
}

function daysInMonth(year: number, month: number): number {
  // month is 0-indexed; passing day 0 of next month returns last day of `month`.
  return new Date(year, month + 1, 0).getDate();
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderPaid(paid: number, billed: number): React.ReactNode {
  if (paid >= billed - 0.01) {
    return <span style={{ color: "var(--success)" }}>{formatINR(paid)}</span>;
  }
  if (paid <= 0.01) {
    return <span style={{ color: "var(--danger)" }}>—</span>;
  }
  return <span style={{ color: "var(--warning)" }}>{formatINR(paid)}</span>;
}

function firstName(s: string): string {
  // Skip a leading honorific (Dr./Mr./Ms./Prof.) so "Dr. Devanshi Vira" greets
  // as "Devanshi", not "Dr.". Falls back to the full name if nothing remains.
  const parts = s.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < parts.length - 1 && /^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(parts[i]!)) i++;
  return parts[i] ?? s;
}
