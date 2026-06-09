// GET — Top-3 most-frequent therapists for a patient, by historical
// appointment count. Powers the booking dialog's "Top 3" tier above
// the all-eligible accordion (PUNCHLIST §1).
//
// Bounded read: cancelled / no-show appointments are excluded so the rank
// reflects who actually saw the patient. Capped at 3 results.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertCentreScope } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("appointments:view_calendar_all");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  // AUTHZ-IDOR-001: gate cross-centre access. Without this, a Centre-A FO
  // can rank therapists for any Centre-B patient by guessing the clientId.
  const client = await prisma.client.findUnique({
    where: { id },
    select: { centreId: true },
  });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  const scope = await assertCentreScope(auth.user, client);
  if (scope) return scope;

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
