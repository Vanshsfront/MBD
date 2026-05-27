// FO-side: issue a fresh ClientPortalToken for a patient. Revokes any
// existing active tokens so the URL Marazban shared yesterday can't be
// shared with a new patient by accident.
//
// PRD §8 + Phase 8. 30-day expiry; reissue rotates.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const TOKEN_TTL_DAYS = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("patients:edit_demographics");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600_000);

  const issued = await prisma.$transaction(async (tx) => {
    // Revoke any active tokens for this client.
    await tx.clientPortalToken.updateMany({
      where: { clientId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Issue a fresh one.
    return tx.clientPortalToken.create({
      data: {
        clientId: id,
        expiresAt,
        issuedById: auth.user.id,
      },
    });
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Client",
    entityId: id,
    performedById: auth.user.id,
    metadata: {
      portalTokenIssued: true,
      portalTokenId: issued.id,
      expiresAt: expiresAt.toISOString(),
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    token: issued.token,
    expiresAt: expiresAt.toISOString(),
  });
}
