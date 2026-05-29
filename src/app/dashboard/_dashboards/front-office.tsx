// FO daily overview — Journey D entry point (PRD §4 D1).
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/role-dashboards.jsx — Front Office variant):
//   - Today strip with 4 live counters
//   - 4 action-led tiles (intake tokens, awaiting assignment, unpaid, change reqs)
//   - 2-col main grid: today's schedule with "Next up" badge + unpaid + low-stock + quick actions

import Link from "next/link";
import { Plus, QrCode, Calendar as CalendarIcon, Receipt, CreditCard, Check, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";

export async function FrontOfficeDashboard({
  userName,
  centreId,
}: {
  userName: string;
  centreId: string | null;
}) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  // Lazy-expire pending intake tokens past their TTL.
  await prisma.intakeToken.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const centreFilter = centreId ? { centreId } : {};

  const [
    pendingIntakeTokens,
    oldestPendingIntake,
    pendingDraftClients,
    todaysAppointments,
    nextAppt,
    unpaidInvoices,
    unpaidAgg,
    lowStock,
    pendingChangeRequests,
  ] = await Promise.all([
    prisma.intakeToken.count({
      where: { ...centreFilter, status: "PENDING", expiresAt: { gt: now } },
    }),
    prisma.intakeToken.findFirst({
      where: { ...centreFilter, status: "PENDING", expiresAt: { gt: now } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.client.count({
      where: { ...centreFilter, status: "DRAFT" },
    }),
    prisma.appointment.findMany({
      where: {
        ...centreFilter,
        startTime: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { startTime: "asc" },
      take: 20,
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        client: { select: { firstName: true, lastName: true } },
        therapist: { select: { name: true } },
        service: { select: { name: true } },
      },
    }),
    prisma.appointment.findFirst({
      where: {
        ...centreFilter,
        startTime: { gte: now, lt: endOfDay },
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
      },
      orderBy: { startTime: "asc" },
      select: { id: true, startTime: true },
    }),
    prisma.invoice.findMany({
      where: {
        ...centreFilter,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        client: { select: { firstName: true, lastName: true, clientCode: true } },
      },
    }),
    prisma.invoice.aggregate({
      where: {
        ...centreFilter,
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      },
      _sum: { totalAmount: true, paidAmount: true },
      _count: true,
    }),
    prisma.inventoryItem.findMany({
      where: {
        ...centreFilter,
        stock: { lte: 5 },
      },
      orderBy: { stock: "asc" },
      take: 4,
      select: {
        id: true,
        stock: true,
        minStock: true,
        product: { select: { name: true } },
      },
    }),
    prisma.changeRequest.count({ where: { status: "PENDING" } }),
  ]);

  const oldestIntakeMin = oldestPendingIntake
    ? Math.max(0, Math.round((now.getTime() - oldestPendingIntake.createdAt.getTime()) / 60000))
    : null;
  const unpaidTotal = Math.max(
    0,
    (unpaidAgg._sum.totalAmount ?? 0) - (unpaidAgg._sum.paidAmount ?? 0),
  );
  const unpaidCount = unpaidAgg._count;

  const nextAppointmentLabel = nextAppt ? minutesUntilLabel(nextAppt.startTime, now) : null;

  // Identify the "next up" — the first appointment whose end time hasn't
  // passed and that isn't cancelled. It either has started ("happening now")
  // or is the very next one due.
  const nextUpId = (() => {
    const candidate = todaysAppointments.find(
      (a) => a.status !== "CANCELLED" && a.endTime > now,
    );
    return candidate?.id ?? null;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Front office</p>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, {firstName(userName)}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <Badge variant="outline">FRONT_OFFICE</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/intake">
              <QrCode className="h-4 w-4" aria-hidden /> Intake QR
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/billing/invoices/new">
              <Plus className="h-4 w-4" aria-hidden /> New invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Today strip — action-led status row (audit n=1) */}
      <div className="fo-today">
        <span className="fo-today-item">
          <span className="dot live" aria-hidden />
          <strong>{pendingIntakeTokens}</strong> intakes waiting
          {oldestIntakeMin != null && pendingIntakeTokens > 0 ? (
            <span className="muted">· longest {oldestIntakeMin} min</span>
          ) : null}
        </span>
        <span className="fo-today-div" />
        <span className="fo-today-item">
          <strong>{todaysAppointments.length}</strong> appointments today
          {nextAppointmentLabel ? <span className="muted">· next {nextAppointmentLabel}</span> : null}
        </span>
        <span className="fo-today-div" />
        <span className={`fo-today-item ${unpaidCount > 0 ? "warn" : ""}`}>
          <strong>{unpaidCount}</strong> unpaid invoices
          {unpaidCount > 0 ? <span className="muted">· {formatINR(unpaidTotal)} total</span> : null}
        </span>
        <span className="fo-today-div" />
        <span className="fo-today-item">
          <strong>{lowStock.length}</strong> low-stock items
          {lowStock.length > 0 ? (
            <span className="muted">· {lowStock.slice(0, 2).map((s) => s.product.name).join(", ")}</span>
          ) : null}
        </span>
      </div>

      {/* Action-led tiles */}
      <div className="fo-stats">
        <StatTile
          href="/dashboard/intake"
          label="Pending intake tokens"
          value={pendingIntakeTokens}
          cta="Open intake →"
        />
        <StatTile
          href="/dashboard/assign"
          label="Awaiting assignment"
          value={pendingDraftClients}
          cta="Assign therapist →"
          emphasis={pendingDraftClients > 0}
        />
        <StatTile
          href="/dashboard/billing/invoices"
          label="Unpaid invoices"
          value={unpaidCount}
          cta="Chase payments →"
        />
        <StatTile
          href="/dashboard/admin/change-requests"
          label="Change requests"
          value={pendingChangeRequests}
          cta="Review →"
        />
      </div>

      <div className="fo-grid">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Today&apos;s schedule</h2>
              <p className="text-xs text-muted-foreground">
                {todaysAppointments.length} appointments
              </p>
            </div>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Calendar <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {todaysAppointments.length === 0 ? (
            <EmptyState title="No appointments booked for today" className="m-4 border-none p-6" />
          ) : (
            <ul className="divide-y divide-[color:var(--border-light)]">
              {todaysAppointments.map((a) => {
                const isDone = a.status === "COMPLETED" || a.endTime <= now;
                const isNow = a.id === nextUpId;
                const isCancelled = a.status === "CANCELLED";
                return (
                  <li
                    key={a.id}
                    className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${
                      isNow ? "border-l-[3px] border-[color:var(--primary)] bg-[rgba(42,125,184,0.06)]" : ""
                    } ${isDone ? "opacity-60" : ""} ${isCancelled ? "opacity-40 line-through" : ""}`}
                  >
                    <span className="w-12 font-mono text-xs font-semibold text-[color:var(--text-tertiary)]">
                      {formatTime(a.startTime)}
                    </span>
                    <span
                      aria-hidden
                      className="grid h-6 w-6 place-items-center rounded-full bg-secondary font-mono text-[9px] font-bold text-[color:var(--text-primary)]"
                      title={a.therapist.name}
                    >
                      {therapistShort(a.therapist.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.client.firstName} {a.client.lastName}
                      </p>
                      <p className="truncate text-[11px] text-[color:var(--text-tertiary)]">
                        {a.service?.name ?? "Service TBD"}
                      </p>
                    </div>
                    {isNow ? (
                      <span className="chip chip-primary">
                        <span className="dot live" aria-hidden /> Next up
                      </span>
                    ) : isDone ? (
                      <span className="chip chip-success">
                        <Check className="h-2.5 w-2.5" aria-hidden /> Done
                      </span>
                    ) : a.status === "CONFIRMED" ? (
                      <span className="chip">Confirmed</span>
                    ) : a.status === "RESCHEDULED" ? (
                      <span className="chip chip-warning">Rescheduled</span>
                    ) : (
                      <span className="chip">{a.status}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
              <h2 className="text-base font-semibold">Unpaid invoices</h2>
              <Link
                href="/dashboard/billing/invoices"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {unpaidInvoices.length === 0 ? (
              <EmptyState title="All invoices paid" className="m-4 border-none p-6" />
            ) : (
              <ul className="divide-y divide-[color:var(--border-light)]">
                {unpaidInvoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/dashboard/billing/invoices/${inv.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {inv.client.firstName} {inv.client.lastName}
                        </p>
                        <p className="truncate font-mono text-[11px] text-[color:var(--text-tertiary)]">
                          {inv.invoiceNumber}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatINR(inv.totalAmount - inv.paidAmount)}
                      </span>
                      <Badge variant={inv.status === "OVERDUE" ? "danger" : "warning"}>
                        {inv.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Low stock</h2>
                <Link
                  href="/dashboard/admin/products"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Order →
                </Link>
              </div>
              {lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">All inventory above threshold.</p>
              ) : (
                <ul className="space-y-2">
                  {lowStock.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.product.name}</span>
                      <span
                        className={`chip ${s.stock <= Math.max(s.minStock, 2) ? "chip-danger" : "chip-warning"}`}
                      >
                        {s.stock} left
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h2 className="mb-3 text-base font-semibold">Quick actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <QuickAction href="/dashboard/intake" icon={<QrCode className="h-4 w-4" />} label="Intake QR" />
                <QuickAction
                  href="/dashboard/calendar"
                  icon={<CalendarIcon className="h-4 w-4" />}
                  label="Calendar"
                />
                <QuickAction
                  href="/dashboard/billing/invoices/new"
                  icon={<Receipt className="h-4 w-4" />}
                  label="New invoice"
                />
                <QuickAction
                  href="/dashboard/billing/payments"
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Payments"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  href,
  label,
  value,
  cta,
  emphasis,
}: {
  href: string;
  label: string;
  value: number;
  cta?: string;
  emphasis?: boolean;
}) {
  return (
    <Link href={href} className={`stat-link ${emphasis ? "is-emphasis" : ""}`}>
      <p className="eyebrow !mb-0">{label}</p>
      <p className="stat-link-v tabular">{value}</p>
      {cta ? <p className="stat-link-cta">{cta}</p> : null}
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href} className="quick-action">
      <span className="quick-action-icon" aria-hidden>
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

function therapistShort(name: string): string {
  // 2-letter therapist code — initials of the first two name tokens, skipping
  // honorifics. "Dr. Devanshi Vira (PT)" → "DV", "Sanjay More" → "SM".
  const tokens = name
    .replace(/\([^)]*\)/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => !/^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(t));
  return (tokens[0]?.[0] ?? "?") + (tokens[1]?.[0] ?? "");
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function minutesUntilLabel(then: Date, now: Date): string {
  const minutes = Math.round((then.getTime() - now.getTime()) / 60000);
  if (minutes < 0) return `at ${formatTime(then)}`;
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  return `at ${formatTime(then)}`;
}

function firstName(s: string): string {
  // Skip a leading honorific (Dr./Mr./Ms./Prof.) so "Dr. Devanshi Vira" greets
  // as "Devanshi", not "Dr.". Falls back to the full name if nothing remains.
  const parts = s.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < parts.length - 1 && /^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(parts[i]!)) i++;
  return parts[i] ?? s;
}
