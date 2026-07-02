// Edit Service price / GST / active state. PRD §3.1 admin:manage_services.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";

const updateSchema = z.object({
  id: z.string().min(1),
  // basePrice in ₹. Hard cap at ₹1,000,000 — sanity, not policy. If a real
  // service costs more, lift this. gstRate stays in fraction form (0..1).
  basePrice: z.number().min(0).max(1_000_000).optional(),
  gstRate: z.number().min(0).max(1).optional(),
  durationMin: z.number().int().min(0).max(480).optional(), // 0–8 hours (info-only)
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:manage_services");
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
  const existing = await prisma.service.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.service.update({
    where: { id: f.id },
    data: {
      ...(f.basePrice !== undefined ? { basePrice: f.basePrice } : {}),
      ...(f.gstRate !== undefined ? { gstRate: f.gstRate } : {}),
      ...(f.durationMin !== undefined ? { durationMin: f.durationMin } : {}),
      ...(f.isActive !== undefined ? { isActive: f.isActive } : {}),
    },
  });

  const changes = computeChanges(
    { basePrice: existing.basePrice, gstRate: existing.gstRate, durationMin: existing.durationMin, isActive: existing.isActive },
    { basePrice: updated.basePrice, gstRate: updated.gstRate, durationMin: updated.durationMin, isActive: updated.isActive },
  );

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Service",
    entityId: f.id,
    performedById: auth.user.id,
    changes,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
