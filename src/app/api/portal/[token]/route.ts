// Public read-only patient portal payload. The token itself is the auth —
// no session needed. Validates expiry + revoked + bumps `lastUsedAt`.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const row = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          clientCode: true,
          centre: { select: { name: true } },
        },
      },
    },
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.revokedAt) return NextResponse.json({ error: "revoked" }, { status: 403 });
  if (row.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 403 });
  }

  // Pull just enough for the public view. PHI minimisation — no clinical
  // notes, no consultation forms, no audit trail.
  const now = new Date();
  const [packages, nextAppointment, invoices] = await Promise.all([
    prisma.package.findMany({
      where: { clientId: row.clientId, status: "ACTIVE" },
      orderBy: { validUntil: "asc" },
      select: {
        id: true,
        totalSessions: true,
        completedSessions: true,
        validUntil: true,
        status: true,
        totalPrice: true,
      },
    }),
    prisma.appointment.findFirst({
      where: {
        clientId: row.clientId,
        status: { in: ["CONFIRMED", "RESCHEDULED"] },
        startTime: { gte: now },
      },
      orderBy: { startTime: "asc" },
      select: {
        startTime: true,
        endTime: true,
        therapist: { select: { name: true } },
        service: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { clientId: row.clientId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        invoiceNumber: true,
        invoiceFlavor: true,
        invoiceType: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        dueDate: true,
      },
    }),
  ]);

  // Bump lastUsedAt — useful telemetry; doesn't gate access.
  await prisma.clientPortalToken
    .update({ where: { id: row.id }, data: { lastUsedAt: now } })
    .catch(() => {
      /* ignore — usage stamp is best-effort */
    });

  return NextResponse.json({
    ok: true,
    patient: {
      name: `${row.client.firstName} ${row.client.lastName}`,
      code: row.client.clientCode,
      centre: row.client.centre?.name ?? null,
    },
    packages: packages.map((p) => ({
      id: p.id,
      totalSessions: p.totalSessions,
      completedSessions: p.completedSessions,
      remaining: p.totalSessions - p.completedSessions,
      validUntil: p.validUntil.toISOString(),
      status: p.status,
      totalPrice: p.totalPrice,
    })),
    nextAppointment: nextAppointment
      ? {
          startIso: nextAppointment.startTime.toISOString(),
          endIso: nextAppointment.endTime.toISOString(),
          therapist: nextAppointment.therapist.name,
          service: nextAppointment.service?.name ?? "To be confirmed",
        }
      : null,
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      flavor: inv.invoiceFlavor,
      type: inv.invoiceType,
      status: inv.status,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      outstanding: Math.max(0, inv.totalAmount - inv.paidAmount),
      createdAt: inv.createdAt.toISOString(),
      dueDate: inv.dueDate?.toISOString() ?? null,
    })),
  });
}
