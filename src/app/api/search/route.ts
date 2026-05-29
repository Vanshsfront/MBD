// GET /api/search?q=term — searches patients (name/code/phone/email),
// invoices (number / client name), today's+upcoming appointments. Results
// scoped to the caller's centre, and to assigned-only for clinical roles.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { isClinicalRole } from "@/lib/permissions";
import { activeCentreId } from "@/lib/centre";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ patients: [], invoices: [], appointments: [] });
  }

  const centreId = await activeCentreId();
  const centreFilter = centreId ? { centreId } : {};
  // Clinical roles (THERAPIST / CONSULTANT) per PRD §3.1:
  //   - patients: only own active assignments
  //   - invoices: not in their permissions at all — return []
  //   - appointments: only ones they're the therapist on
  // Do NOT loosen any of these without revising the permission matrix.
  const restrictToOwn = isClinicalRole(auth.user.role);

  const [patients, invoices, appointments] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...centreFilter,
        ...(restrictToOwn
          ? {
              doctorAssignments: {
                some: { staffId: auth.user.id, endedAt: null },
              },
            }
          : {}),
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { clientCode: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { firstName: "asc" },
      take: 8,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        clientCode: true,
        phone: true,
        status: true,
      },
    }),
    restrictToOwn
      ? Promise.resolve([])
      : prisma.invoice.findMany({
          where: {
            ...centreFilter,
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" } },
              { client: { firstName: { contains: q, mode: "insensitive" } } },
              { client: { lastName: { contains: q, mode: "insensitive" } } },
              { client: { clientCode: { contains: q, mode: "insensitive" } } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          include: {
            client: { select: { firstName: true, lastName: true, clientCode: true } },
          },
        }),
    prisma.appointment.findMany({
      where: {
        ...centreFilter,
        ...(restrictToOwn ? { therapistId: auth.user.id } : {}),
        startTime: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        OR: [
          { client: { firstName: { contains: q, mode: "insensitive" } } },
          { client: { lastName: { contains: q, mode: "insensitive" } } },
          { client: { clientCode: { contains: q, mode: "insensitive" } } },
        ],
      },
      orderBy: { startTime: "asc" },
      take: 6,
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        therapist: { select: { name: true } },
        service: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    patients: patients.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      clientCode: p.clientCode,
      phone: p.phone,
      status: p.status,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      client: `${i.client.firstName} ${i.client.lastName} (${i.client.clientCode})`,
      status: i.status,
      totalAmount: i.totalAmount,
    })),
    appointments: appointments.map((a) => ({
      id: a.id,
      patientName: `${a.client.firstName} ${a.client.lastName}`,
      patientId: a.client.id,
      therapistName: a.therapist.name,
      serviceName: a.service?.name ?? "Service TBD",
      startTime: a.startTime.toISOString(),
      status: a.status,
    })),
  });
}
