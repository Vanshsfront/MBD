// FO endpoint: finalise a DRAFT client. Records customer-type, referral
// source, and one or more therapist assignments. Flips status to ACTIVE.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";

const assignSchema = z.object({
  customerType: z.enum(["WALK_IN", "BOOKING", "REFERRAL"]),
  referralSourceId: z.string().optional().or(z.literal("")).transform((v) => v || undefined),
  referredByName: z.string().max(120).optional(),
  therapists: z
    .array(
      z.object({
        staffId: z.string().min(1),
        isPrimary: z.boolean().optional(),
        comment: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("patients:assign_therapist");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = (await req.json()) as unknown;
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const meta = requestMeta(req);

  const result = await prisma.$transaction(async (tx) => {
    // Close any existing active assignments on the same client.
    await tx.clientDoctorAssignment.updateMany({
      where: { clientId: id, endedAt: null },
      data: { endedAt: new Date(), endedReason: "REASSIGNED_AT_INTAKE" },
    });

    const assignments = await Promise.all(
      f.therapists.map((t, i) =>
        tx.clientDoctorAssignment.create({
          data: {
            clientId: id,
            staffId: t.staffId,
            isPrimary: t.isPrimary ?? i === 0,
            comment: t.comment ?? null,
          },
        }),
      ),
    );

    const updated = await tx.client.update({
      where: { id },
      data: {
        status: "ACTIVE",
        customerType: f.customerType,
        referralSourceId: f.referralSourceId ?? null,
        referredByName: f.referredByName ?? null,
      },
    });

    return { updated, assignments };
  });

  const changes = computeChanges(
    { status: client.status, customerType: client.customerType, referralSourceId: client.referralSourceId },
    { status: result.updated.status, customerType: result.updated.customerType, referralSourceId: result.updated.referralSourceId },
  );

  await createAuditLog({
    action: "UPDATE",
    entity: "Client",
    entityId: id,
    performedById: auth.user.id,
    changes,
    metadata: { therapistIds: result.assignments.map((a) => a.staffId) },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  for (const a of result.assignments) {
    await createAuditLog({
      action: "CREATE",
      entity: "ClientDoctorAssignment",
      entityId: a.id,
      performedById: auth.user.id,
      metadata: { clientId: id, staffId: a.staffId, isPrimary: a.isPrimary },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.json({ ok: true, clientId: id });
}
