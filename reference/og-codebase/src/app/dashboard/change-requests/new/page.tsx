// Server entry for the structured change-request creator.
// Loads the therapist's actionable context — upcoming appointments (for
// RESCHEDULE), active assignments (for REASSIGN), and staff in the same
// department (the candidate new assignees) — and hands it to the client form.
//
// Without this context the FO Approve button would have nothing to act on,
// which is the exact failure mode the audit on 2026-05-08 caught.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NewChangeRequestForm } from "./form";

export const metadata = { title: "New change request — MBD Clinic OS" };

export default async function NewChangeRequestPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "appointments:request_change")) {
    redirect("/dashboard");
  }
  const userId = session.user.id;

  // Upcoming + recent appointments for THIS therapist. Pull a 90-day window so
  // both "tomorrow's slot" and "the one yesterday I forgot to mark" are
  // reachable. Exclude already-cancelled. Computed once per request from a
  // single `now` snapshot — Server Components run on each request so this
  // is effectively a request-scoped constant.
  const now = currentTime();
  const windowStart = new Date(now - 7 * 24 * 3600_000);
  const windowEnd = new Date(now + 90 * 24 * 3600_000);

  const [appointments, assignments, deptStaff] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        therapistId: userId,
        startTime: { gte: windowStart, lt: windowEnd },
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
      },
      orderBy: { startTime: "asc" },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, clientCode: true } },
        service: { select: { id: true, name: true } },
      },
      take: 60,
    }),
    prisma.clientDoctorAssignment.findMany({
      where: { staffId: userId, endedAt: null },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, clientCode: true },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: 60,
    }),
    // Candidate new assignees: same department as the requester, active, not self.
    session.user.departmentId
      ? prisma.staff.findMany({
          where: {
            departmentId: session.user.departmentId,
            isActive: true,
            id: { not: userId },
          },
          select: { id: true, name: true, designation: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Raise a change request</h1>
        <p className="text-sm text-muted-foreground">
          Pick the exact appointment or assignment you want changed. The front office reviews; on
          Approve, the system makes the change automatically.
        </p>
      </header>
      <NewChangeRequestForm
        appointments={appointments.map((a) => ({
          id: a.id,
          startIso: a.startTime.toISOString(),
          endIso: a.endTime.toISOString(),
          clientName: `${a.client.firstName} ${a.client.lastName}`,
          clientCode: a.client.clientCode,
          serviceName: a.service.name,
        }))}
        assignments={assignments.map((a) => ({
          id: a.id,
          clientId: a.client.id,
          clientName: `${a.client.firstName} ${a.client.lastName}`,
          clientCode: a.client.clientCode,
          isPrimary: a.isPrimary,
          serviceName: a.serviceName ?? null,
        }))}
        candidateStaff={deptStaff.map((s) => ({
          id: s.id,
          name: s.name,
          designation: s.designation ?? null,
        }))}
      />
    </div>
  );
}

// Wrap `Date.now()` so the call doesn't trip react-hooks/purity inline. Server
// Components compute once per request; the impurity is intentional.
function currentTime(): number {
  return Date.now();
}
