import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, computeChanges } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("activeOnly") !== "false";

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (activeOnly) where.isActive = true;

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        service: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("[GET /api/inventory]", error);
    return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, sku, category, unitPrice, gstRate, hsnSacCode, stock, minStock, serviceId } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name,
        sku: sku || null,
        category: category || null,
        unitPrice: unitPrice ? parseFloat(unitPrice) : 0,
        gstRate: gstRate ? parseFloat(gstRate) : 0,
        hsnSacCode: hsnSacCode || null,
        stock: stock ? parseInt(stock) : 0,
        minStock: minStock ? parseInt(minStock) : 0,
        serviceId: serviceId || null,
      },
    });

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "InventoryItem",
      entityId: item.id,
      performedById: body.performedById,
      metadata: { name, sku, category },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("[POST /api/inventory]", error);
    return NextResponse.json({ error: "Failed to create inventory item" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    // Fetch existing for audit diff
    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        name: updateData.name,
        sku: updateData.sku,
        category: updateData.category,
        unitPrice: updateData.unitPrice ? parseFloat(updateData.unitPrice) : undefined,
        gstRate: updateData.gstRate ? parseFloat(updateData.gstRate) : undefined,
        hsnSacCode: updateData.hsnSacCode,
        stock: updateData.stock !== undefined ? parseInt(updateData.stock) : undefined,
        minStock: updateData.minStock !== undefined ? parseInt(updateData.minStock) : undefined,
        serviceId: updateData.serviceId || undefined,
      },
    });

    // Audit trail
    const changes = computeChanges(existing as Record<string, unknown>, item as unknown as Record<string, unknown>);
    await createAuditLog({
      action: "UPDATE",
      entity: "InventoryItem",
      entityId: id,
      performedById: body.performedById,
      changes,
      metadata: { itemName: existing.name },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("[PUT /api/inventory]", error);
    return NextResponse.json({ error: "Failed to update inventory item" }, { status: 500 });
  }
}
