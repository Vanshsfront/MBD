// Inventory adjustments: stock-in (positive) / stock-out (negative) / adjust /
// supplier+price update. Logs every change in InventoryLog and audit log.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const stockSchema = z.object({
  inventoryItemId: z.string().min(1),
  delta: z.number().int(),
  action: z.enum(["STOCK_IN", "STOCK_OUT", "ADJUST"]),
  notes: z.string().max(300).optional(),
});

const priceSchema = z.object({
  inventoryItemId: z.string().min(1),
  supplierName: z.string().max(120).optional(),
  supplyPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
});

export async function POST(req: Request) {
  // Stock movement.
  const auth = await requirePermission("admin:manage_products");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = stockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;
  const item = await prisma.inventoryItem.findUnique({ where: { id: f.inventoryItemId } });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const newStock = item.stock + f.delta;
  if (newStock < 0) {
    return NextResponse.json({ error: "would_go_negative" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: f.inventoryItemId },
      data: { stock: newStock },
    }),
    prisma.inventoryLog.create({
      data: {
        inventoryItemId: f.inventoryItemId,
        action: f.action,
        quantity: f.delta,
        notes: f.notes ?? null,
        performedById: auth.user.id,
      },
    }),
  ]);

  const meta = requestMeta(req);
  await createAuditLog({
    action: f.action === "STOCK_IN" ? "CREATE" : f.action === "STOCK_OUT" ? "DELETE" : "UPDATE",
    entity: "InventoryItem",
    entityId: f.inventoryItemId,
    performedById: auth.user.id,
    changes: { stock: { old: item.stock, new: newStock } },
    metadata: { action: f.action, delta: f.delta, notes: f.notes },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, stock: newStock });
}

export async function PATCH(req: Request) {
  // Supplier / price / threshold edit.
  const auth = await requirePermission("admin:manage_products");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = priceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.inventoryItem.findUnique({ where: { id: f.inventoryItemId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updated = await prisma.inventoryItem.update({
    where: { id: f.inventoryItemId },
    data: {
      ...(f.supplierName !== undefined ? { supplierName: f.supplierName } : {}),
      ...(f.supplyPrice !== undefined ? { supplyPrice: f.supplyPrice } : {}),
      ...(f.sellingPrice !== undefined ? { sellingPrice: f.sellingPrice } : {}),
      ...(f.minStock !== undefined ? { minStock: f.minStock } : {}),
    },
  });

  // If price changed, snapshot history.
  if (
    (f.supplyPrice !== undefined && f.supplyPrice !== existing.supplyPrice) ||
    (f.sellingPrice !== undefined && f.sellingPrice !== existing.sellingPrice) ||
    (f.supplierName !== undefined && f.supplierName !== existing.supplierName)
  ) {
    await prisma.inventoryPriceHistory.create({
      data: {
        inventoryItemId: f.inventoryItemId,
        supplierName: updated.supplierName,
        supplyPrice: updated.supplyPrice,
        sellingPrice: updated.sellingPrice,
        changedById: auth.user.id,
      },
    });
  }

  await createAuditLog({
    action: "UPDATE",
    entity: "InventoryItem",
    entityId: f.inventoryItemId,
    performedById: auth.user.id,
    changes: {
      supplyPrice: { old: existing.supplyPrice, new: updated.supplyPrice },
      sellingPrice: { old: existing.sellingPrice, new: updated.sellingPrice },
      supplierName: { old: existing.supplierName, new: updated.supplierName },
      minStock: { old: existing.minStock, new: updated.minStock },
    },
  });

  return NextResponse.json({ ok: true });
}
