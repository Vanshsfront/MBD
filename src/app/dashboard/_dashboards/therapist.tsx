// Therapist (and Consultant) overview — Journey C entry point (PRD §4 C1).
// Layout follows the 2026-05-29 Claude Design handoff
// (mbd/project/mbd/role-dashboards.jsx — Therapist variant):
//   - Patient-centric today strip (4 counters)
//   - 3 stat tiles (today's appts is the emphasised CTA)
//   - 2-col main grid: day-as-timeline + drafts + this-week stats + notifications

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  AlertTriangle,
  FileText,
  Plus,
  Check,
  Calendar as CalendarIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/permissions";

export async function TherapistDashboard({
  currentUserId,
  userName,
  role,
}: {
  currentUserId: string;
  userName: string;
  role: Role;
}) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfPriorWeek = new Date(startOfWeek);
  startOfPriorWeek.setDate(startOfPriorWeek.getDate() - 7);

  const [
    todaysAppointments,
    assignedPatientCount,
    inactiveAssignedCount,
    draftConsultations,
    myChangeRequests,
    myNotifications,
    weekAppts,
    weekSessions,
    weekConsultsCompleted,
    weekConsultsLockedOnTime,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        therapistId: currentUserId,
        startTime: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        notes: true,
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
        service: { select: { name: true } },
      },
    }),
    prisma.client.count({
      where: {
        status: "ACTIVE",
        doctorAssignments: { some: { staffId: currentUserId, endedAt: null } },
      },
    }),
    prisma.client.count({
      where: {
        status: "INACTIVE",
        doctorAssignments: { some: { staffId: currentUserId, endedAt: null } },
      },
    }),
    prisma.consultation.findMany({
      where: { consultantId: currentUserId, status: "DRAFT" },
      orderBy: { date: "desc" },
      take: 6,
      select: {
        id: true,
        templateKey: true,
        date: true,
        client: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.changeRequest.count({
      where: { requesterId: currentUserId, status: "PENDING" },
    }),
    prisma.notification.findMany({
      where: { targetUserId: currentUserId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, type: true, title: true, message: true, createdAt: true },
    }),
    // This-week stat: appointments delivered (completed)
    prisma.appointment.count({
      where: {
        therapistId: currentUserId,
        startTime: { gte: startOfWeek },
        status: "COMPLETED",
      },
    }),
    // Sessions delivered (a Session model row marked completed)
    prisma.session.count({
      where: {
        therapistId: currentUserId,
        sessionDate: { gte: startOfWeek },
        status: "COMPLETED",
      },
    }),
    // Records-locked-on-time numerator+denominator. Pull the COMPLETED/LOCKED
    // consultations from the past week, then bucket "locked < 24h" in JS so
    // we don't need a duration computation in Postgres.
    prisma.consultation.findMany({
      where: {
        consultantId: currentUserId,
        date: { gte: startOfWeek },
        status: { in: ["COMPLETED", "LOCKED"] },
      },
      select: { createdAt: true, lockedAt: true },
    }),
    prisma.consultation.count({
      where: {
        consultantId: currentUserId,
        date: { gte: startOfPriorWeek, lt: startOfWeek },
        status: { in: ["COMPLETED", "LOCKED"] },
      },
    }),
  ]);

  // Bucket "locked on time" in JS (within 24h of createdAt).
  const lockedOnTime = weekConsultsCompleted.filter((c) => {
    if (!c.lockedAt) return false;
    return c.lockedAt.getTime() - c.createdAt.getTime() <= 24 * 60 * 60 * 1000;
  }).length;
  const lockedDenom = Math.max(weekConsultsCompleted.length, weekConsultsLockedOnTime, 1);

  // Today-strip data: next appointment + draft count + change requests.
  // "Next" only makes sense for an appointment that hasn't reached a terminal
  // state — exclude CANCELLED/COMPLETED/NO_SHOW so a finished appt with a
  // still-future endTime stops being tagged Next over a truly upcoming one.
  const isActiveAppt = (s: string) =>
    s !== "CANCELLED" && s !== "COMPLETED" && s !== "NO_SHOW";
  const nextApptTime = todaysAppointments.find(
    (a) => a.startTime >= now && isActiveAppt(a.status),
  )?.startTime;
  const nextUpId = todaysAppointments.find(
    (a) => isActiveAppt(a.status) && a.endTime > now,
  )?.id;
  // Hours billed: sum durations across this week's completed appointments.
  const hoursBilledWeekRows = await prisma.appointment.findMany({
    where: {
      therapistId: currentUserId,
      startTime: { gte: startOfWeek },
      status: "COMPLETED",
    },
    select: { startTime: true, endTime: true },
  });
  const hoursBilled = hoursBilledWeekRows.reduce(
    (s, r) => s + (r.endTime.getTime() - r.startTime.getTime()) / (1000 * 60 * 60),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{role === "CONSULTANT" ? "Consultant" : "Therapist"}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, {firstName(userName)}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <Badge variant="outline">{role}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/calendar">
              <CalendarIcon className="h-4 w-4" aria-hidden /> My day
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/patients">
              <Plus className="h-4 w-4" aria-hidden /> New clinical record
            </Link>
          </Button>
        </div>
      </div>

      {/* Today strip — patient-centric (audit n=1). Counter excludes
        * cancelled + no-show so the headline number matches what's actually
        * actionable on the day. */}
      <div className="fo-today">
        <span className="fo-today-item">
          <span className="dot live" aria-hidden />
          <strong>
            {todaysAppointments.filter((a) => isActiveAppt(a.status)).length}
          </strong>{" "}
          appointments today
          {nextApptTime ? <span className="muted">· next at {formatTime(nextApptTime)}</span> : null}
        </span>
        <span className="fo-today-div" />
        <span className="fo-today-item">
          <strong>{assignedPatientCount}</strong> assigned patients
          {inactiveAssignedCount > 0 ? (
            <span className="muted">· {inactiveAssignedCount} inactive</span>
          ) : null}
        </span>
        <span className="fo-today-div" />
        <span className={`fo-today-item ${draftConsultations.length > 0 ? "warn" : ""}`}>
          <strong>{draftConsultations.length}</strong> clinical drafts
          <span className="muted">· not yet locked</span>
        </span>
        <span className="fo-today-div" />
        <span className={`fo-today-item ${myChangeRequests > 0 ? "warn" : ""}`}>
          <strong>{myChangeRequests}</strong> change requests
          <span className="muted">· awaiting review</span>
        </span>
      </div>

      {/* 3 stat tiles */}
      <div className="fo-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <StatTile
          href="/dashboard/calendar"
          label="Today's appointments"
          value={todaysAppointments.length}
          cta="Open calendar →"
          emphasis
        />
        <StatTile
          href="/dashboard/patients"
          label="Assigned patients"
          value={assignedPatientCount}
          cta="View list →"
        />
        <StatTile
          href="/dashboard/sessions"
          label="Drafts to complete"
          value={draftConsultations.length}
          cta="Lock records →"
        />
      </div>

      <div className="fo-grid">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Today&apos;s day</h2>
              <p className="text-xs text-muted-foreground">{todaysAppointments.length} appointments</p>
            </div>
            <span className="autosave">
              <span className="dot live" aria-hidden /> Live
            </span>
          </div>
          {todaysAppointments.length === 0 ? (
            <EmptyState title="Nothing booked for today" className="m-4 border-none p-6" />
          ) : (
            <ul className="divide-y divide-[color:var(--border-light)] px-5 py-1">
              {todaysAppointments.map((a) => {
                const isDone = a.status === "COMPLETED" || a.endTime <= now;
                const isNext = a.id === nextUpId;
                const isCancelled = a.status === "CANCELLED";
                return (
                  <li
                    key={a.id}
                    className={`flex gap-4 py-3 ${
                      isNext ? "-mx-5 border-l-[3px] border-[color:var(--primary)] bg-[rgba(42,125,184,0.06)] px-5" : ""
                    } ${isDone ? "opacity-60" : ""} ${isCancelled ? "opacity-40 line-through" : ""}`}
                  >
                    <span
                      className={`w-14 shrink-0 pt-0.5 font-mono text-xs font-semibold ${
                        isNext ? "text-[color:var(--primary)]" : "text-[color:var(--text-tertiary)]"
                      }`}
                    >
                      {formatTime(a.startTime)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {a.client.firstName} {a.client.lastName}
                        </span>
                        {isNext ? (
                          <span className="chip chip-primary">
                            <span className="dot live" aria-hidden /> Next
                          </span>
                        ) : isDone ? (
                          <span className="chip chip-success">
                            <Check className="h-2.5 w-2.5" aria-hidden /> Done
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-[color:var(--text-tertiary)]">{a.service?.name ?? "Service TBD"}</p>
                      {a.notes ? (
                        <p className="mt-1 text-[11.5px] text-muted-foreground">{a.notes}</p>
                      ) : null}
                    </div>
                    <Link
                      href={`/dashboard/patients/${a.client.id}/clinical`}
                      className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-[color:var(--border-light)] px-2.5 py-1 text-xs font-medium text-[color:var(--text-secondary)] transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {isDone ? "Open" : isNext ? "Start" : "Open"}
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Drafts to complete</h2>
                <p className="text-xs text-muted-foreground">Lock before end of day</p>
              </div>
              {draftConsultations.length > 0 ? (
                <span className="chip chip-warning">{draftConsultations.length}</span>
              ) : null}
            </div>
            {draftConsultations.length === 0 ? (
              <EmptyState title="No drafts open" className="m-4 border-none p-6" />
            ) : (
              <ul className="divide-y divide-[color:var(--border-light)]">
                {draftConsultations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/patients/${c.client.id}/clinical`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {c.client.firstName} {c.client.lastName}
                        </p>
                        <p className="truncate text-[11px] text-[color:var(--text-tertiary)]">
                          {c.templateKey} · {formatRelative(c.date, now)}
                        </p>
                      </div>
                      <span className="chip chip-warning">DRAFT</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="mb-3 text-sm font-semibold">My patients · this week</h3>
              <UtilRow
                k="Appointments completed"
                v={weekAppts}
                max={Math.max(weekAppts + 4, 1)}
                color="var(--chart-3)"
              />
              <UtilRow
                k="Records locked within 24h"
                v={lockedOnTime}
                max={lockedDenom}
                color="var(--chart-1)"
              />
              <UtilRow
                k="Sessions delivered"
                v={weekSessions}
                max={Math.max(weekSessions + 4, 1)}
                color="var(--chart-4)"
              />
              <UtilRow
                k="Hours billed"
                v={Math.round(hoursBilled)}
                max={Math.max(Math.ceil(hoursBilled) + 8, 1)}
                color="var(--chart-2)"
                suffix="h"
              />
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-[color:var(--border-light)] px-5 py-4">
              <h2 className="text-base font-semibold">Notifications</h2>
              {myNotifications.length > 0 ? (
                <span className="chip">{myNotifications.length}</span>
              ) : null}
            </div>
            {myNotifications.length === 0 ? (
              <EmptyState title="No unread notifications" className="m-4 border-none p-6" />
            ) : (
              <ul className="divide-y divide-[color:var(--border-light)]">
                {myNotifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-[color:var(--text-secondary)]">
                      {n.type.includes("ALERT") || n.type.includes("FLAG") ? (
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      ) : n.type.includes("DRAFT") ? (
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Bell className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-[color:var(--text-tertiary)]">{n.message}</p>
                    </div>
                    <span className="text-[11px] text-[color:var(--text-tertiary)] whitespace-nowrap">
                      {formatRelative(n.createdAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
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

