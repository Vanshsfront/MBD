import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { activeCentreId } from "@/lib/centre";
import { staffColor } from "@/lib/staff-colors";
import { CalendarClient } from "./calendar-client";

export const metadata = { title: "Calendar — MBD Clinic OS" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; returnTo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "appointments:view_calendar_all")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const initialClientId = params.clientId ?? "";
  const returnTo =
    params.returnTo?.startsWith("/dashboard/patients/") ? params.returnTo : undefined;

  const canBook = hasPermission(session.user.role, "appointments:book_reschedule_cancel");
  // Front office books slots but does not assign the clinical service — the
  // therapist sets that later. Everyone else who can book also picks it.
  const canAssignService = canBook && session.user.role !== "FRONT_OFFICE";
  const centreId = await activeCentreId();

  const therapists = await prisma.staff.findMany({
    where: {
      isActive: true,
      role: { in: ["THERAPIST", "CONSULTANT", "ADMIN"] },
      ...(centreId ? { centreId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true, departmentId: true, department: { select: { name: true } } },
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
      phone: true,
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
      canAssignService={canAssignService}
      initialClientId={initialClientId}
      returnTo={returnTo}
      therapists={therapists.map((t) => ({
        id: t.id,
        name: t.name,
        color: staffColor(t.id, t.color),
        departmentId: t.departmentId,
        department: t.department?.name ?? null,
      }))}
      services={services}
      clients={clients.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        clientCode: c.clientCode,
        phone: c.phone,
        therapistIds: c.doctorAssignments.map((a) => a.staffId),
      }))}
    />
  );
}
