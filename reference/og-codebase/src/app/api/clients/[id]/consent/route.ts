// FO submits the signed consent. Two paths: PHYSICAL_SCAN (an uploaded image
// data URL) or DIGITAL_PAD (signature_pad data URL). Both store the image as
// `Client.consentFormPhotoUrl` (data URL — small enough for our scale; can be
// migrated to object storage later).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const consentSchema = z.object({
  consentMethod: z.enum(["PHYSICAL_SCAN", "DIGITAL_PAD"]),
  signatureDataUrl: z.string().min(20).startsWith("data:"),
});

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB cap on the data URL

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("patients:assign_therapist");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = (await req.json()) as unknown;
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;
  if (f.signatureDataUrl.length > MAX_BYTES) {
    return NextResponse.json({ error: "signature_too_large" }, { status: 413 });
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: { intakeForms: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const intakeForm = client.intakeForms[0];
  if (!intakeForm) return NextResponse.json({ error: "no_intake_form" }, { status: 400 });

  const meta = requestMeta(req);

  await prisma.$transaction([
    prisma.client.update({
      where: { id },
      data: { consentFormPhotoUrl: f.signatureDataUrl },
    }),
    prisma.intakeForm.update({
      where: { id: intakeForm.id },
      data: {
        consentMethod: f.consentMethod,
        consentSigned: true,
        liabilityWaiverSigned: true,
        signatureDataUrl: f.signatureDataUrl,
        frontOfficeExecId: auth.user.id,
      },
    }),
  ]);

  await createAuditLog({
    action: "UPDATE",
    entity: "Client",
    entityId: id,
    performedById: auth.user.id,
    changes: {
      consentFormPhotoUrl: { old: client.consentFormPhotoUrl, new: "<signature data url>" },
    },
    metadata: { consentMethod: f.consentMethod },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "IntakeForm",
    entityId: intakeForm.id,
    performedById: auth.user.id,
    changes: {
      consentSigned: { old: intakeForm.consentSigned, new: true },
      consentMethod: { old: intakeForm.consentMethod, new: f.consentMethod },
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
