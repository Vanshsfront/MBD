// Referral sources CRUD. PRD §3.1 admin:manage_referral_sources.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requirePermission("admin:manage_referral_sources");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const r = await prisma.referralSource.create({
      data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder },
    });
    await createAuditLog({
      action: "CREATE",
      entity: "ReferralSource",
      entityId: r.id,
      performedById: auth.user.id,
      metadata: { name: parsed.data.name },
    });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (err) {
    if (err instanceof Error && err.message.match(/unique/i)) {
      return NextResponse.json({ error: "name_taken" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:manage_referral_sources");
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
  await prisma.referralSource.update({
    where: { id: f.id },
    data: {
      ...(f.name !== undefined ? { name: f.name } : {}),
      ...(f.sortOrder !== undefined ? { sortOrder: f.sortOrder } : {}),
      ...(f.isActive !== undefined ? { isActive: f.isActive } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
