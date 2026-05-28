// Promotions CRUD. PRD §3.1 admin:manage_promotions (OWNER+DEV only).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const createSchema = z
  .object({
    code: z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/i),
    name: z.string().min(1).max(80),
    description: z.string().max(300).optional(),
    discountType: z.enum(["PERCENT", "FLAT"]),
    // PERCENT must be in [0,100]; FLAT can be any non-negative ₹ amount.
    discountValue: z.number().min(0),
    maxDiscount: z.number().min(0).optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
    maxUses: z.number().int().min(0).optional(),
  })
  .refine(
    (v) => v.discountType !== "PERCENT" || v.discountValue <= 100,
    { message: "PERCENT promotions cannot exceed 100%.", path: ["discountValue"] },
  )
  .refine(
    (v) => !v.validFrom || !v.validUntil || new Date(v.validFrom) <= new Date(v.validUntil),
    { message: "validFrom must be on or before validUntil.", path: ["validUntil"] },
  );

// On update we don't see discountType, so PERCENT/FLAT validation happens
// against the existing row below in the PATCH handler.
const updateSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  discountValue: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  validUntil: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await requirePermission("admin:manage_promotions");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  try {
    const promo = await prisma.promotion.create({
      data: {
        code: f.code.toUpperCase(),
        name: f.name,
        description: f.description ?? null,
        discountType: f.discountType,
        discountValue: f.discountValue,
        maxDiscount: f.maxDiscount ?? null,
        validFrom: f.validFrom ? new Date(f.validFrom) : null,
        validUntil: f.validUntil ? new Date(f.validUntil) : null,
        maxUses: f.maxUses ?? null,
      },
    });
    await createAuditLog({
      action: "CREATE",
      entity: "Promotion",
      entityId: promo.id,
      performedById: auth.user.id,
      metadata: { code: promo.code, name: promo.name },
    });
    return NextResponse.json({ ok: true, id: promo.id });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("Unique") || err.message.includes("unique"))
    ) {
      return NextResponse.json({ error: "code_taken" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:manage_promotions");
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
  const existing = await prisma.promotion.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Cross-field checks that need the existing row's discountType + validFrom.
  if (
    f.discountValue !== undefined &&
    existing.discountType === "PERCENT" &&
    f.discountValue > 100
  ) {
    return NextResponse.json(
      { error: "validation_failed", message: "PERCENT promotions cannot exceed 100%." },
      { status: 400 },
    );
  }
  if (
    f.validUntil &&
    existing.validFrom &&
    new Date(f.validUntil) < new Date(existing.validFrom)
  ) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message: "validUntil cannot be before this promotion's validFrom.",
      },
      { status: 400 },
    );
  }

  await prisma.promotion.update({
    where: { id: f.id },
    data: {
      ...(f.isActive !== undefined ? { isActive: f.isActive } : {}),
      ...(f.discountValue !== undefined ? { discountValue: f.discountValue } : {}),
      ...(f.maxDiscount !== undefined ? { maxDiscount: f.maxDiscount } : {}),
      ...(f.validUntil !== undefined
        ? { validUntil: f.validUntil ? new Date(f.validUntil) : null }
        : {}),
    },
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "Promotion",
    entityId: f.id,
    performedById: auth.user.id,
    changes: {
      isActive: { old: existing.isActive, new: f.isActive ?? existing.isActive },
      discountValue: {
        old: existing.discountValue,
        new: f.discountValue ?? existing.discountValue,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
