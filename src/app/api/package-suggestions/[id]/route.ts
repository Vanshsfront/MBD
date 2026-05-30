// Resolve a package suggestion: FO marks it ACCEPTED (when they create the
// package off the back of it) or DISMISSED (not actionable). Therapists
// can't resolve their own suggestions — that's an FO operation.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const RESOLVER_ROLES = new Set(["FRONT_OFFICE", "OWNER", "ADMIN"]);

const patchSchema = z.object({
  status: z.enum(["ACCEPTED", "DISMISSED"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!RESOLVER_ROLES.has(auth.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.packageSuggestion.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.status !== "PENDING") {
    return NextResponse.json({ error: "already_resolved" }, { status: 409 });
  }

  const updated = await prisma.packageSuggestion.update({
    where: { id },
    data: {
      status: parsed.data.status,
      resolvedAt: new Date(),
      resolvedByStaffId: auth.user.id,
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Package",
    entityId: id,
    performedById: auth.user.id,
    metadata: { kind: "package_suggestion_resolve", to: parsed.data.status },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ suggestion: updated });
}
