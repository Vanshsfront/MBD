// Therapist (and Consultant) overview — Journey C entry point (PRD §4 C1).
// Today's appointments + patients assigned to me + pending follow-ups +
// my own pending change requests.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [todaysAppointments, assignedPatientCount, draftConsultations, myChangeRequests, myNotifications] =
    await Promise.all([
      prisma.appointment.findMany({
        where: {
          therapistId: currentUserId,
          startTime: { gte: startOfDay, lt: endOfDay },
          status: { in: ["CONFIRMED", "RESCHEDULED"] },
        },
        orderBy: { startTime: "asc" },
        include: {
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
      prisma.consultation.findMany({
        where: { consultantId: currentUserId, status: "DRAFT" },
        orderBy: { date: "desc" },
        take: 8,
        include: { client: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.changeRequest.findMany({
        where: { requesterId: currentUserId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.notification.findMany({
        where: { targetUserId: currentUserId, isRead: false },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName(userName)}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <Badge variant="outline">{role}</Badge>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Today's appointments" value={todaysAppointments.length} />
        <Stat label="Assigned active patients" value={assignedPatientCount} />
        <Stat label="Drafts to complete" value={draftConsultations.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s appointments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {todaysAppointments.length === 0 ? (
              <EmptyState title="Nothing booked for today" />
            ) : (
              <ul className="divide-y">
                {todaysAppointments.map((a) => (
                  <li key={a.id} className="px-6 py-3">
                    <Link
                      href={`/dashboard/patients/${a.client.id}/clinical`}
                      className="flex items-center justify-between gap-3 transition-colors hover:opacity-80"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {a.client.firstName} {a.client.lastName}{" "}
                          <span className="text-muted-foreground">({a.client.clientCode})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{a.service?.name ?? "Service TBD"}</p>
                      </div>
                      <span className="font-mono text-sm tabular-nums">
                        {a.startTime.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drafts to complete</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {draftConsultations.length === 0 ? (
              <EmptyState title="No drafts open" />
            ) : (
              <ul className="divide-y">
                {draftConsultations.map((c) => (
                  <li key={c.id} className="px-6 py-3">
                    <Link
                      href={`/dashboard/patients/${c.client.id}/clinical`}
                      className="flex items-center justify-between gap-3 transition-colors hover:opacity-80"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {c.client.firstName} {c.client.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.templateKey}</p>
                      </div>
                      <Badge variant="warning">DRAFT</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending change requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {myChangeRequests.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                No pending change requests. File one from a patient&apos;s clinical record if a
                reschedule or reassign is needed.
              </p>
            ) : (
              <ul className="divide-y">
                {myChangeRequests.map((r) => (
                  <li key={r.id} className="px-6 py-3 text-sm">
                    <p className="font-medium">{r.type}</p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {r.createdAt.toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {myNotifications.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No unread notifications.</p>
            ) : (
              <ul className="divide-y">
                {myNotifications.map((n) => (
                  <li key={n.id} className="px-6 py-3">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
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
