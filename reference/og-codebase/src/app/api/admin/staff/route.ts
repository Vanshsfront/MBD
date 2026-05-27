// Admin staff actions: activate/deactivate + password reset.
// Limited to admin:manage_staff (OWNER, ADMIN, DEV per PRD §3.1).

import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";

const updateSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(6).max(60).optional(),
  designation: z.string().max(120).optional(),
});

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:manage_staff");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.staff.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Owner cannot be deactivated by anyone except themselves.
  if (
    existing.role === "OWNER" &&
    f.isActive === false &&
    auth.user.id !== existing.id
  ) {
    return NextResponse.json({ error: "cannot_deactivate_owner" }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (f.isActive !== undefined) data.isActive = f.isActive;
  if (f.designation !== undefined) data.designation = f.designation;
  if (f.resetPassword) {
    data.passwordHash = await hash(f.resetPassword, 10);
  }

  const updated = await prisma.staff.update({ where: { id: f.id }, data });

  const changes = computeChanges(
    { isActive: existing.isActive, designation: existing.designation },
    { isActive: updated.isActive, designation: updated.designation },
  );

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: f.id,
    performedById: auth.user.id,
    changes,
    metadata: f.resetPassword ? { passwordReset: true } : undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
