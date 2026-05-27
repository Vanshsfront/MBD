import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { CalendarClient } from "./calendar-client";

export const metadata = { title: "Calendar — MBD Clinic OS" };

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "appointments:view_calendar_all")) {
    redirect("/dashboard");
  }

  const canBook = hasPermission(session.user.role, "appointments:book_reschedule_cancel");
  const centreId = await activeCentreId();

  const therapists = await prisma.staff.findMany({
    where: {
      isActive: true,
      role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
      ...(centreId ? { centreId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
  });

  const services = await prisma.service.findMany({
    where: { isActive: true, ...(centreId ? { OR: [{ centreId }, { centreId: null }] } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, basePrice: true, departmentId: true, participantCount: true },
  });

  const clients = await prisma.client.findMany({
    where: {
      status: "ACTIVE",
      ...(centreId ? { centreId } : {}),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      clientCode: true,
      firstName: true,
      lastName: true,
      doctorAssignments: {
        where: { endedAt: null },
        select: { staffId: true },
      },
    },
  });

  return (
    <CalendarClient
      currentUserId={session.user.id}
      isClinicalRole={!canBook}
      canBook={canBook}
      therapists={therapists.map((t) => ({
        id: t.id,
        name: t.name,
        departmentId: t.departmentId,
        department: t.department?.name ?? null,
      }))}
      services={services}
      clients={clients.map((c) => ({
        id: c.id,
        label: `${c.firstName} ${c.lastName} (${c.clientCode})`,
        therapistIds: c.doctorAssignments.map((a) => a.staffId),
      }))}
    />
  );
}
