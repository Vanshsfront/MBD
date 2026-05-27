// Change own password. Requires current password match.

import { NextResponse } from "next/server";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(80),
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
  const f = parsed.data;

  const staff = await prisma.staff.findUnique({ where: { id: auth.user.id } });
  if (!staff) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ok = await compare(f.currentPassword, staff.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "wrong_password" }, { status: 403 });
  }

  await prisma.staff.update({
    where: { id: staff.id },
    data: { passwordHash: await hash(f.newPassword, 10) },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: staff.id,
    performedById: auth.user.id,
    metadata: { selfService: true, action: "password_change" },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
