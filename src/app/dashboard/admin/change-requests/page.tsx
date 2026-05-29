// FO/OWNER/ADMIN review queue for change requests.
// Resolves the structured payload's IDs into display names server-side so the
// reviewer sees a readable card instead of raw JSON.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ChangeRequestsView, type EnrichedRequest } from "./change-requests-client";

export const metadata = { title: "Change requests — MBD Clinic OS" };

interface ReschedulePayload {
  appointmentId: string;
  fromStartIso: string;
  fromEndIso: string;
  toStartIso: string;
  toEndIso: string;
  reason: string;
}

interface ReassignPayload {
  clientId: string;
  fromAssignmentId: string;
  toStaffId: string;
  reason: string;
}

interface OtherPayload {
  freeText: string;
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export default async function ChangeRequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "appointments:review_change_request")) {
    redirect("/dashboard");
  }

  const requests = await prisma.changeRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      requester: { select: { name: true, role: true } },
      reviewedBy: { select: { name: true } },
    },
  });

  // Collect IDs we need to resolve into names so the reviewer sees something
  // human-readable. One round-trip per entity type.
  const apptIds = new Set<string>();
  const clientIds = new Set<string>();
  const staffIds = new Set<string>();
  const assignmentIds = new Set<string>();

  for (const r of requests) {
    const payload = safeParse<unknown>(r.payloadJson);
    if (r.type === "RESCHEDULE" && payload && typeof payload === "object") {
      const p = payload as ReschedulePayload;
      if (p.appointmentId) apptIds.add(p.appointmentId);
    }
    if (r.type === "REASSIGN" && payload && typeof payload === "object") {
      const p = payload as ReassignPayload;
      if (p.clientId) clientIds.add(p.clientId);
      if (p.fromAssignmentId) assignmentIds.add(p.fromAssignmentId);
      if (p.toStaffId) staffIds.add(p.toStaffId);
    }
  }

  const [appts, clients, staff, assignments] = await Promise.all([
    apptIds.size > 0
      ? prisma.appointment.findMany({
          where: { id: { in: Array.from(apptIds) } },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
            client: { select: { firstName: true, lastName: true, clientCode: true } },
            therapist: { select: { name: true } },
            service: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    clientIds.size > 0
      ? prisma.client.findMany({
          where: { id: { in: Array.from(clientIds) } },
          select: { id: true, firstName: true, lastName: true, clientCode: true },
        })
      : Promise.resolve([]),
    staffIds.size > 0
      ? prisma.staff.findMany({
          where: { id: { in: Array.from(staffIds) } },
          select: { id: true, name: true, designation: true },
        })
      : Promise.resolve([]),
    assignmentIds.size > 0
      ? prisma.clientDoctorAssignment.findMany({
          where: { id: { in: Array.from(assignmentIds) } },
          select: {
            id: true,
            staff: { select: { name: true } },
            serviceName: true,
            isPrimary: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const apptById = new Map(appts.map((a) => [a.id, a]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));

  const enriched: EnrichedRequest[] = requests.map((r) => {
    const payload = safeParse<unknown>(r.payloadJson);
    let summary: EnrichedRequest["summary"] = null;
    if (r.type === "RESCHEDULE" && payload) {
      const p = payload as ReschedulePayload;
      const appt = apptById.get(p.appointmentId);
      summary = {
        kind: "RESCHEDULE",
        reason: p.reason,
        fromStartIso: p.fromStartIso,
        fromEndIso: p.fromEndIso,
        toStartIso: p.toStartIso,
        toEndIso: p.toEndIso,
        appointment: appt
          ? {
              id: appt.id,
              status: appt.status,
              clientName: `${appt.client.firstName} ${appt.client.lastName}`,
              clientCode: appt.client.clientCode,
              therapistName: appt.therapist.name,
              serviceName: appt.service?.name ?? "Service TBD",
            }
          : null,
      };
    } else if (r.type === "REASSIGN" && payload) {
      const p = payload as ReassignPayload;
      const c = clientById.get(p.clientId);
      const newStaff = staffById.get(p.toStaffId);
      const oldAssignment = assignmentById.get(p.fromAssignmentId);
      summary = {
        kind: "REASSIGN",
        reason: p.reason,
        client: c
          ? {
              id: c.id,
              name: `${c.firstName} ${c.lastName}`,
              code: c.clientCode,
            }
          : null,
        fromTherapistName: oldAssignment?.staff.name ?? null,
        fromServiceName: oldAssignment?.serviceName ?? null,
        toTherapist: newStaff
          ? { id: newStaff.id, name: newStaff.name, designation: newStaff.designation ?? null }
          : null,
      };
    } else {
      const p = (payload as OtherPayload | null) ?? null;
      summary = {
        kind: "OTHER",
        freeText: p?.freeText ?? r.details,
      };
    }

    return {
      id: r.id,
      type: r.type,
      status: r.status,
      response: r.response,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      requesterName: r.requester.name,
      requesterRole: r.requester.role,
      reviewedByName: r.reviewedBy?.name ?? null,
      summary,
    };
  });

  return <ChangeRequestsView requests={enriched} />;
}
