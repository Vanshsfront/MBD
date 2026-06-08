// POST /api/clients/[id]/erase
//
// Right-to-erasure (DPDPA 2023 §13) implementation.
//
// What it does, atomically, in one transaction:
//   1. Anonymises Client PII — firstName="Erased", lastName="(<clientCode>)",
//      and NULLs phone, email, dob, age, address, emergencyContact,
//      occupation, sport, maritalStatus, dominance, consentFormPhotoUrl,
//      visitReasons.
//   2. Sets Client.status = "ERASED" so UI surfaces the redaction.
//   3. Deletes all IntakeForm rows for the client (clinical PII).
//   4. Deletes all MedicalHistory rows (clinical PII).
//   5. PRESERVES Invoice, Payment, Appointment, Session, MisEntry,
//      PackageSuggestion, AuditLog — Indian tax law requires 8-year
//      retention on financial records; these reference the client by ID
//      only and contain no recoverable PII beyond what the audit log
//      tracks (which is itself permitted under DPDPA §15(c) for
//      contractual / legal / public-interest grounds).
//   6. Writes an ERASE audit-log entry capturing the reason + actor.
//
// Permission model:
//   - Requires admin:manage_clinics — OWNER + DEV today. (ADMIN today
//     does NOT have manage_clinics; deliberately conservative for an
//     irreversible operation.)
//   - Requires centre-scope.
//
// Reference: audit-2026-06-06 F-003 (Critical) / DATA-004.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta, assertCentreScope } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  reason: z.string().min(5).max(500),
  // Belt-and-braces guard against accidental erasure via fat-fingered
  // request bodies. The client MUST type "ERASE" to confirm.
  confirm: z.literal("ERASE"),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("admin:manage_clinics");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.client.findUnique({
    where: { id },
    select: { id: true, centreId: true, clientCode: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }
  const scope = await assertCentreScope(auth.user, existing);
  if (scope) return scope;
  if (existing.status === "ERASED") {
    return NextResponse.json({ ok: true, alreadyErased: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.intakeForm.deleteMany({ where: { clientId: id } });
    await tx.medicalHistory.deleteMany({ where: { clientId: id } });
    await tx.client.update({
      where: { id },
      data: {
        firstName: "Erased",
        lastName: `(${existing.clientCode})`,
        email: null,
        phone: "",
        dob: null,
        age: null,
        sex: null,
        dominance: null,
        occupation: null,
        sport: null,
        maritalStatus: null,
        address: null,
        emergencyContact: null,
        visitReasons: null,
        consentFormPhotoUrl: null,
        status: "ERASED",
      },
    });
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "DELETE",
    entity: "Client",
    entityId: id,
    performedById: auth.user.id,
    metadata: {
      operation: "erase",
      reason: f.reason,
      clientCode: existing.clientCode,
      preserved: ["Invoice", "Payment", "Appointment", "Session", "MisEntry", "AuditLog"],
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  logger.warn(
    {
      event: "client.erased",
      clientId: id,
      clientCode: existing.clientCode,
      performedBy: auth.user.id,
      reason: f.reason,
    },
    "client PII erased",
  );

  return NextResponse.json({ ok: true, anonymized: true });
}
