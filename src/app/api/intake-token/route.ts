// FO endpoint: create a new IntakeToken (60-min expiry) for a walk-in patient.
// Public counterpart at /api/intake/[token]/submit accepts the patient form.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";
import { activeCentreId } from "@/lib/centre";

const TOKEN_TTL_MIN = 60;

const bodySchema = z.object({ label: z.string().trim().max(60).optional() });

export async function POST(req: Request) {
  const auth = await requirePermission("patients:generate_intake_qr");
  if (!auth.ok) return auth.response;

  // Optional friendly label so the FO sees "Walk-in — Ramesh" instead of a raw
  // token id. Body may be empty.
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const label = parsed.success && parsed.data.label ? parsed.data.label : null;

  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);
  // The new IntakeToken should land in the centre the user is *currently
  // looking at* — not always their home centre. PRD §6.10.
  const centreId = (await activeCentreId()) ?? auth.user.centreId ?? null;

  const token = await prisma.intakeToken.create({
    data: {
      expiresAt,
      centreId,
      label,
      createdById: auth.user.id,
      status: "PENDING",
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "IntakeToken",
    entityId: token.id,
    performedById: auth.user.id,
    changes: { token: { old: null, new: token.token } },
    metadata: { expiresAt: expiresAt.toISOString() },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    id: token.id,
    token: token.token,
    expiresAt: token.expiresAt,
    label: token.label,
  });
}

export async function GET() {
  const auth = await requirePermission("patients:generate_intake_qr");
  if (!auth.ok) return auth.response;

  const centreId = await activeCentreId();
  const tokens = await prisma.intakeToken.findMany({
    where: {
      ...(centreId ? { centreId } : {}),
      status: { in: ["PENDING", "COMPLETED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { createdBy: { select: { name: true } } },
  });

  // Lazy expire: tokens past their TTL flip to EXPIRED on read.
  const now = new Date();
  const expiredIds = tokens
    .filter((t) => t.status === "PENDING" && t.expiresAt < now)
    .map((t) => t.id);
  if (expiredIds.length > 0) {
    await prisma.intakeToken.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: "EXPIRED" },
    });
  }

  return NextResponse.json(
    tokens.map((t) => ({
      id: t.id,
      token: t.token,
      status: expiredIds.includes(t.id) ? "EXPIRED" : t.status,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
      createdBy: t.createdBy?.name ?? null,
      label: t.label,
      clientId: t.clientId,
    })),
  );
}
