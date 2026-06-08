// POST /api/auth/revoke-sessions
//
// Increments Staff.sessionVersion, which invalidates every outstanding JWT
// for the user (api-auth.ts:verifySessionVersion rejects tokens with stale
// versions on the next request). Use cases:
//
//   - "Sign out everywhere" button on the profile page (self).
//   - Admin tooling to kill a compromised account's outstanding sessions.
//   - Programmatic call from the role-change handler when an admin alters
//     a staff member's role so the new permissions take effect immediately.
//
// Permission model:
//   - Authenticated user may revoke their OWN sessions (body { scope: "self" }).
//   - OWNER/ADMIN may revoke another user's sessions via body { scope: "user",
//     staffId: "..." }.
//
// Reference: audit-2026-06-06 F-012 (High).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const bodySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("self") }),
  z.object({ scope: z.literal("user"), staffId: z.string().min(1) }),
]);

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const targetId =
    parsed.data.scope === "self" ? auth.user.id : parsed.data.staffId;

  // Authorization: revoking someone else's sessions requires OWNER/ADMIN.
  if (targetId !== auth.user.id) {
    if (!(auth.user.role === "OWNER" || auth.user.role === "ADMIN" || auth.user.role === "DEV")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const target = await prisma.staff.findUnique({
    where: { id: targetId },
    select: { id: true, sessionVersion: true },
  });
  if (!target) {
    return NextResponse.json({ error: "staff_not_found" }, { status: 404 });
  }

  const updated = await prisma.staff.update({
    where: { id: target.id },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: target.id,
    performedById: auth.user.id,
    changes: {
      sessionVersion: { old: target.sessionVersion, new: updated.sessionVersion },
    },
    metadata: { reason: "session_revoke", scope: parsed.data.scope },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    sessionVersion: updated.sessionVersion,
  });
}
