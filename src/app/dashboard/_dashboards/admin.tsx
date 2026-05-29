// Admin overview — dedicated landing surface per the 2026-05-29 Claude Design
// handoff (mbd/project/mbd/role-dashboards.jsx — Admin variant).
//
// Today ADMIN routes through the Owner dashboard. The audit pin (n=1) on the
// proposed design calls out the gap: an admin's daily work is staff +
// operations + compliance, not revenue overview. This page surfaces those
// directly:
//   - Today strip: staff on duty, appointments today + utilisation %,
//     pending change requests, clinical drafts > 24h
//   - 4 action-led tiles: Active staff, Services & rates, Products, Change requests
//   - 2-col main: recent admin activity (from AuditLog) + quick actions + compliance card
//
// The compliance card in the prototype lists four metrics; one of them
// ("failed login attempts") needs a new audit-log write site at the auth
// callback. Per the locked-in rule to inform before touching backend
// behaviour, this dashboard ships with the three metrics that read off
// existing data and intentionally omits the fourth. Wire it in a follow-up
// once the user opts in.

import Link from "next/link";
import { ArrowRight, BarChart3, Bell, History, List, Plus, UserCog } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/permissions";

export async function AdminDashboard({
  userName,
  role,
  centreId,
}: {
  userName: string;
  role: Role;
  centreId: string | null;
}) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const centreFilter = centreId ? { centreId } : {};

  const [
    activeStaffCount,
    activeStaffByRole,
    serviceCount,
    productCount,
    pendingChangeRequests,
    apptsTodayTotal,
    apptsTodayCompleted,
    clinicalDraftsOldCount,
    recentActivity,
    weekConsultsCompleted,
    activeClientsCount,
    consentedClientsCount,
    weekExpiredTokens,
  ] = await Promise.all([
    prisma.staff.count({ where: { isActive: true, ...centreFilter } }),
    prisma.staff.groupBy({
      by: ["role"],
      where: { isActive: true, ...centreFilter },
      _count: { _all: true },
    }),
    prisma.service.count({ where: { isActive: true, ...(centreId ? { OR: [{ centreId }, { centreId: null }] } : {}) } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.changeRequest.count({ where: { status: "PENDING" } }),
    prisma.appointment.count({
      where: {
        ...centreFilter,
        startTime: { gte: startOfDay, lt: endOfDay },
        status: { in: ["CONFIRMED", "RESCHEDULED", "COMPLETED"] },
      },
    }),
    prisma.appointment.count({
      where: {
        ...centreFilter,
        startTime: { gte: startOfDay, lt: endOfDay },
        status: "COMPLETED",
      },
    }),
    prisma.consultation.count({
      where: {
        status: "DRAFT",
        createdAt: { lt: oneDayAgo },
        ...(centreId ? { client: { centreId } } : {}),
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        action: true,
        entity: true,
        createdAt: true,
        performedBy: { select: { name: true } },
      },
    }),
    // Compliance #1 — records locked within 24h, this week. Pull the
    // small set of completed/locked consultations and bucket in JS.
    prisma.consultation.findMany({
      where: {
        date: { gte: startOfWeek },
        status: { in: ["COMPLETED", "LOCKED"] },
        ...(centreId ? { client: { centreId } } : {}),
      },
      select: { createdAt: true, lockedAt: true },
    }),
    // Compliance #2 — consents on file: % of clients with a signed intake
    // form among the ACTIVE roster.
    prisma.client.count({
      where: { ...centreFilter, status: "ACTIVE" },
    }),
    prisma.client.count({
      where: {
        ...centreFilter,
        status: "ACTIVE",
        OR: [
          { intakeForms: { some: { consentSigned: true } } },
          { consentFormPhotoUrl: { not: null } },
        ],
      },
    }),
    // Compliance #3 — intake tokens that expired this week (unconverted).
    prisma.intakeToken.count({
      where: {
        ...(centreId ? { centreId } : {}),
        status: "EXPIRED",
        updatedAt: { gte: startOfWeek },
      },
    }),
  ]);

  const therapistCount =
    activeStaffByRole.find((r) => r.role === "THERAPIST")?._count._all ?? 0;
  const consultantCount =
    activeStaffByRole.find((r) => r.role === "CONSULTANT")?._count._all ?? 0;
  const utilisationPct = apptsTodayTotal > 0
    ? Math.round((apptsTodayCompleted / apptsTodayTotal) * 100)
    : 0;

  const lockedOnTime = weekConsultsCompleted.filter((c) => {
    if (!c.lockedAt) return false;
    return c.lockedAt.getTime() - c.createdAt.getTime() <= 24 * 60 * 60 * 1000;
  }).length;
  const lockedRatio = weekConsultsCompleted.length === 0
    ? null
    : Math.round((lockedOnTime / weekConsultsCompleted.length) * 100);
  const consentRatio = activeClientsCount === 0
    ? null
    : Math.round((consentedClientsCount / activeClientsCount) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName(userName)}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <Badge variant="outline">{role}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/admin/staff">
              <UserCog className="h-4 w-4" aria-hidden /> Manage staff
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/reports/mis">
              <BarChart3 className="h-4 w-4" aria-hidden /> Open MIS
            </Link>
          </Button>
        </div>
      </div>

      {/* Today strip — admin-centric counters (audit n=1) */}
      <div className="fo-today">
        <span className="fo-today-item">
          <strong>{activeStaffCount}</strong> active staff
          {therapistCount + consultantCount > 0 ? (
            <span className="muted">
              · {therapistCount} therapist{therapistCount === 1 ? "" : "s"}
              {consultantCount > 0 ? ` · ${consultantCount} consultant${consultantCount === 1 ? "" : "s"}` : ""}
            </span>
          ) : null}
        </span>
        <span className="fo-today-div" />
        <span className="fo-today-item">
          <strong>{apptsTodayTotal}</strong> appointments today
          {apptsTodayTotal > 0 ? (
            <span className="muted">· {utilisationPct}% completed</span>
          ) : null}
        </span>
        <span className="fo-today-div" />
        <span className={`fo-today-item ${pendingChangeRequests > 0 ? "warn" : ""}`}>
          <strong>{pendingChangeRequests}</strong> change requests
          <span className="muted">· awaiting review</span>
        </span>
        <span className="fo-today-div" />
        <span className={`fo-today-item ${clinicalDraftsOldCount > 0 ? "warn" : ""}`}>
          <strong>{clinicalDraftsOldCount}</strong> clinical drafts
          <span className="muted">· over 24h old</span>
        </span>
      </div>

      {/* Action-led tiles */}
      <div className="fo-stats">
        <StatTile href="/dashboard/admin/staff" label="Active staff" value={activeStaffCount} cta="Manage →" />
        <StatTile
          href="/dashboard/admin/services"
          label="Services & rates"
          value={serviceCount}
          cta="Update →"
        />
        <StatTile
          href="/dashboard/admin/products"
          label="Products"
          value={productCount}
          cta="Order →"
        />
        <StatTile
          href="/dashboard/admin/change-requests"
          label="Pending change requests"
          value={pendingChangeRequests}
          cta="Review →"
          emphasis={pendingChangeRequests > 0}
        />
      </div>

      <div className="fo-grid">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
            <h2 className="text-base font-semibold">Recent admin activity</h2>
            <Link
              href="/dashboard/admin/audit"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Open audit log <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState title="No recent activity" className="m-4 border-none p-6" />
          ) : (
            <ul className="divide-y divide-[color:var(--border-light)]">
              {recentActivity.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold"
                  >
                    {initials(row.performedBy?.name)}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{row.performedBy?.name ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">{humanizeAction(row.action, row.entity)}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-[color:var(--text-tertiary)] whitespace-nowrap">
                    {formatRelative(row.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="p-6">
              <h3 className="mb-3 text-sm font-semibold">Quick admin actions</h3>
              <div className="flex flex-col gap-2">
                <QuickAction
                  href="/dashboard/admin/staff"
                  icon={<UserCog className="h-4 w-4" />}
                  label="Add staff"
                  hint="Therapist, FO, consultant"
                />
                <QuickAction
                  href="/dashboard/admin/services"
                  icon={<List className="h-4 w-4" />}
                  label="Update rates"
                  hint={`${serviceCount} services`}
                />
                <QuickAction
                  href="/dashboard/admin/change-requests"
                  icon={<Bell className="h-4 w-4" />}
                  label="Change requests"
                  hint={
                    pendingChangeRequests === 0
                      ? "None pending"
                      : `${pendingChangeRequests} pending`
                  }
                />
                <QuickAction
                  href="/dashboard/admin/audit"
                  icon={<History className="h-4 w-4" />}
                  label="Audit log"
                />
                <QuickAction
                  href="/dashboard/billing/invoices/new"
                  icon={<Plus className="h-4 w-4" />}
                  label="New invoice"
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="mb-3 text-sm font-semibold">Compliance · this week</h3>
              <div className="space-y-2">
                <ComplianceRow
                  k="Records locked within 24h"
                  v={lockedRatio == null ? "—" : `${lockedRatio}%`}
                  variant={ratioVariant(lockedRatio, 80)}
                />
                <ComplianceRow
                  k="Consents on file"
                  v={consentRatio == null ? "—" : `${consentRatio}%`}
                  variant={ratioVariant(consentRatio, 95)}
                />
                <ComplianceRow k="Intake tokens expired" v={`${weekExpiredTokens}`} variant="chip" />
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
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <Link href={href} className="quick-action">
      <span className="quick-action-icon" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="truncate text-[11px] text-[color:var(--text-tertiary)]">{hint}</p> : null}
      </div>
    </Link>
  );
}

function ComplianceRow({
  k,
  v,
  variant,
}: {
  k: string;
  v: string;
  variant: "chip" | "chip-success" | "chip-warning" | "chip-danger";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={`chip ${variant === "chip" ? "" : variant} tabular`}>{v}</span>
    </div>
  );
}

function ratioVariant(
  ratio: number | null,
  goodAt: number,
): "chip" | "chip-success" | "chip-warning" | "chip-danger" {
  if (ratio == null) return "chip";
  if (ratio >= goodAt) return "chip-success";
  if (ratio >= goodAt - 15) return "chip-warning";
  return "chip-danger";
}

function humanizeAction(action: string, entity: string): string {
  // Keep the prose short — the audit log itself is the deep view. We just need
  // a recognisable verb here on the dashboard.
  const verb = (() => {
    switch (action) {
      case "CREATE":
        return "added";
      case "UPDATE":
        return "updated";
      case "DELETE":
        return "deleted";
      case "LOGIN":
        return "signed in";
      case "EXPORT":
        return "exported";
      default:
        return action.toLowerCase();
    }
  })();
  if (action === "LOGIN") return verb;
  return `${verb} ${entity.toLowerCase()}`;
}

function initials(name: string | null | undefined): string {
  if (!name) return "SY";
  const parts = name
    .replace(/\([^)]*\)/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => !/^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(t));
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

function formatRelative(d: Date, now: Date): string {
  const diff = now.getTime() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function firstName(s: string): string {
  // Skip a leading honorific (Dr./Mr./Ms./Prof.) so "Dr. Devanshi Vira" greets
  // as "Devanshi", not "Dr.". Falls back to the full name if nothing remains.
  const parts = s.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < parts.length - 1 && /^(dr|mr|mrs|ms|prof|miss)\.?$/i.test(parts[i]!)) i++;
  return parts[i] ?? s;
}
