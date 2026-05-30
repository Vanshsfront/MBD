// Walk-in stub client — FO creates the minimum viable Client row at booking
// time so the slot can be reserved without a full intake. The patient
// completes intake on arrival via the same /api/clients/[id]/intake-on-behalf
// endpoint that handles "FO fills it" cases; that handler flips
// `intakeStatus` from PENDING_INTAKE back to COMPLETED.
//
// Required: firstName + phone. Everything else is filled out at intake time.
// Returns { clientId } — the caller (CreateWalkInDialog) immediately POSTs
// to /api/appointments with this id and serviceId=null.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { activeCentreId } from "@/lib/centre";
import { createAuditLog } from "@/lib/audit";

const walkInSchema = z.object({
  firstName: z.string().trim().min(1, "first_name_required").max(80),
  // Last name is optional for walk-ins — FO can fill it later.
  lastName: z.string().trim().max(80).default(""),
  phone: z.string().trim().min(7, "phone_required").max(40),
});

export async function POST(req: Request) {
  const auth = await requirePermission("patients:assign_therapist");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = walkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;
  const centreId = await activeCentreId();

  const centre = centreId
    ? await prisma.centre.findUnique({ where: { id: centreId }, select: { slug: true } })
    : null;
  const centreSlug = centre?.slug ?? "COL-MBD";

  const result = await prisma.$transaction(async (tx) => {
    // Atomic, race-safe client code via the per-centre counter (mirrors the
    // intake-token flow at /api/intake/[token]/submit).
    let seq: number;
    if (centreId) {
      const existing = await tx.clientCodeCounter.findUnique({ where: { centreId } });
      if (!existing) {
        const base = await tx.client.count({ where: { centreId } });
        await tx.clientCodeCounter.create({ data: { centreId, lastSequence: base } });
      }
      const updated = await tx.clientCodeCounter.update({
        where: { centreId },
        data: { lastSequence: { increment: 1 } },
      });
      seq = updated.lastSequence;
    } else {
      seq = (await tx.client.count()) + 1;
    }
    const clientCode = `${centreSlug}-${seq.toString().padStart(4, "0")}`;

    return await tx.client.create({
      data: {
        clientCode,
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.phone,
        status: "DRAFT",
        intakeStatus: "PENDING_INTAKE",
        customerType: "WALK_IN",
        centreId,
      },
      select: { id: true, clientCode: true, firstName: true, lastName: true, phone: true },
    });
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Client",
    entityId: result.id,
    performedById: auth.user.id,
    metadata: { kind: "walk-in", clientCode: result.clientCode, intakeStatus: "PENDING_INTAKE" },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ client: result }, { status: 201 });
}
