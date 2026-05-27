// Save own signature image. Used when generating clinical PDFs to stamp
// the consultant's signature on the document.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const schema = z.object({
  signatureDataUrl: z.string().min(20).startsWith("data:image/").max(2 * 1024 * 1024),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await prisma.staff.update({
    where: { id: auth.user.id },
    data: { signatureDataUrl: parsed.data.signatureDataUrl },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: auth.user.id,
    performedById: auth.user.id,
    metadata: { selfService: true, action: "signature_update" },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  await prisma.staff.update({
    where: { id: auth.user.id },
    data: { signatureDataUrl: null },
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: auth.user.id,
    performedById: auth.user.id,
    metadata: { selfService: true, action: "signature_clear" },
  });

  return NextResponse.json({ ok: true });
}
