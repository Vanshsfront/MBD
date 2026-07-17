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
  guardianConsent: z.boolean().optional(),
  guardianName: z.string().optional(),
  guardianRelationship: z.string().optional(),
  guardianSignatureDataUrl: z.string().min(20).startsWith("data:").optional(),
});

const MAX_BYTES = 11 * 1024 * 1024; // ≈8 MB raw image after base64 overhead

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
  if (
    f.signatureDataUrl.length > MAX_BYTES ||
    (f.guardianSignatureDataUrl?.length ?? 0) > MAX_BYTES
  ) {
    return NextResponse.json({ error: "signature_too_large" }, { status: 413 });
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: { intakeForms: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const intakeForm = client.intakeForms[0];
  if (!intakeForm) return NextResponse.json({ error: "no_intake_form" }, { status: 400 });

  // A minor's consent isn't a real record without the guardian's signature.
  // The UI enforces this too, but the fields were previously all optional here,
  // so anything bypassing the form could finalize a minor with no guardian at
  // all. Age at capture time governs — this never re-opens old records.
  const isMinor = client.age !== null && client.age < 18;
  if (
    isMinor &&
    (!f.guardianConsent || !f.guardianName?.trim() || !f.guardianSignatureDataUrl)
  ) {
    return NextResponse.json({ error: "guardian_consent_required" }, { status: 400 });
  }

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
        guardianConsent: f.guardianConsent ?? undefined,
        guardianName: f.guardianName ?? undefined,
        guardianRelationship: f.guardianRelationship ?? undefined,
        guardianSignatureDataUrl: f.guardianSignatureDataUrl ?? undefined,
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
