// GET — Top-3 most-frequent therapists for a patient, by historical
// appointment count. Powers the booking dialog's "Top 3" tier above
// the all-eligible accordion (PUNCHLIST §1).
//
// Bounded read: cancelled / no-show appointments are excluded so the rank
// reflects who actually saw the patient. Capped at 3 results.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Role } from "@/lib/permissions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as Role;
  if (!hasPermission(role, "appointments:view_calendar_all")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;

  const grouped = await prisma.appointment.groupBy({
    by: ["therapistId"],
    where: {
      clientId: id,
      status: { in: ["CONFIRMED", "RESCHEDULED", "COMPLETED"] },
    },
    _count: { _all: true },
    orderBy: { _count: { therapistId: "desc" } },
    take: 3,
  });

  if (grouped.length === 0) return NextResponse.json({ topTherapists: [] });

  const therapists = await prisma.staff.findMany({
    where: { id: { in: grouped.map((g) => g.therapistId) } },
    select: {
      id: true,
      name: true,
      designation: true,
      department: { select: { name: true } },
    },
  });

  const byId = new Map(therapists.map((t) => [t.id, t]));
  const result = grouped
    .map((g) => {
      const t = byId.get(g.therapistId);
      if (!t) return null;
      return {
        id: t.id,
        name: t.name,
        designation: t.designation,
        department: t.department?.name ?? null,
        visits: g._count._all,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ topTherapists: result });
}
