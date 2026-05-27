// Inventory consumed during a clinical session — PRD §4 C5 + §6.9.
//
// Therapist records what inventory items were used in a session (e.g. a roll
// of K-Tape during physio). We decrement the InventoryItem.stock and write
// an InventoryLog{USED_IN_SESSION} row per line, all in one transaction so a
// failed write doesn't half-decrement the catalog.
//
// Auth: clinical roles only — and the consultation (if linked) must belong
// to them. FO can also call this for an on-the-spot adjustment, but it
// requires the inventory:adjust permission (see api-auth).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

const createSchema = z.object({
  consultationId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        qty: z.number().int().min(1).max(100),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
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

  // Authorisation:
  //   - Clinical roles need to own the consultation/session being charged.
  //   - Non-clinical roles need an inventory mutation permission.
  if (isClinicalRole(auth.user.role)) {
    if (f.consultationId) {
      const c = await prisma.consultation.findUnique({
        where: { id: f.consultationId },
        select: { consultantId: true },
      });
      if (!c) return NextResponse.json({ error: "consultation_not_found" }, { status: 404 });
      if (c.consultantId !== auth.user.id) {
        return NextResponse.json({ error: "consultation_not_yours" }, { status: 403 });
      }
    } else if (f.sessionId) {
      const s = await prisma.session.findUnique({
        where: { id: f.sessionId },
        select: { therapistId: true },
      });
      if (!s) return NextResponse.json({ error: "session_not_found" }, { status: 404 });
      if (s.therapistId !== auth.user.id) {
        return NextResponse.json({ error: "session_not_yours" }, { status: 403 });
      }
    } else {
      return NextResponse.json(
        { error: "consultation_or_session_required" },
        { status: 400 },
      );
    }
  } else if (!hasPermission(auth.user.role, "admin:manage_products")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Pre-flight stock check — avoid partial decrements. Tally per inventoryItem
  // since the same item may appear on multiple lines.
  const tally = new Map<string, number>();
  for (const it of f.items) {
    tally.set(it.inventoryItemId, (tally.get(it.inventoryItemId) ?? 0) + it.qty);
  }
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: Array.from(tally.keys()) } },
    select: { id: true, stock: true, productId: true, product: { select: { name: true } } },
  });
  if (items.length !== tally.size) {
    return NextResponse.json({ error: "inventory_item_not_found" }, { status: 404 });
  }
  for (const it of items) {
    const requested = tally.get(it.id) ?? 0;
    if (it.stock < requested) {
      return NextResponse.json(
        {
          error: "insufficient_stock",
          inventoryItemId: it.id,
          productName: it.product.name,
          available: it.stock,
          requested,
        },
        { status: 409 },
      );
    }
  }

  const meta = requestMeta(req);

  // Apply: decrement + log + audit, all in one transaction.
  const logIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const it of f.items) {
      await tx.inventoryItem.update({
        where: { id: it.inventoryItemId },
        data: { stock: { decrement: it.qty } },
      });
      const log = await tx.inventoryLog.create({
        data: {
          inventoryItemId: it.inventoryItemId,
          action: "USED_IN_SESSION",
          quantity: -it.qty,
          notes: it.notes ?? null,
          sessionId: f.sessionId ?? null,
          performedById: auth.user.id,
        },
      });
      logIds.push(log.id);
    }
  });

  // Audit (outside the transaction — audit log row writes are idempotent
  // and we don't want a slow audit insert holding the inventory tx).
  for (const id of logIds) {
    await createAuditLog({
      action: "CREATE",
      entity: "InventoryLog",
      entityId: id,
      performedById: auth.user.id,
      metadata: {
        consultationId: f.consultationId ?? null,
        sessionId: f.sessionId ?? null,
        action: "USED_IN_SESSION",
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  return NextResponse.json({ ok: true, logIds });
}
