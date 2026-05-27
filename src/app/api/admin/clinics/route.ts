// Centres CRUD with copy-from-existing for services + products.
// PRD §3.1 admin:manage_clinics — OWNER + DEV only.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "uppercase + dashes"),
  location: z.string().min(1).max(200),
  contactPhone: z.string().max(40).optional(),
  gstNumber: z.string().max(40).optional(),
  panNumber: z.string().max(20).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankIfsc: z.string().max(20).optional(),
  bankBranch: z.string().max(120).optional(),
  copyFromCentreId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requirePermission("admin:manage_clinics");
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

  let createdId = "";
  try {
    const result = await prisma.$transaction(async (tx) => {
      const centre = await tx.centre.create({
        data: {
          name: f.name,
          slug: f.slug.toUpperCase(),
          location: f.location,
          contactPhone: f.contactPhone ?? null,
          gstNumber: f.gstNumber ?? null,
          panNumber: f.panNumber ?? null,
          bankName: f.bankName ?? null,
          bankAccountNumber: f.bankAccountNumber ?? null,
          bankIfsc: f.bankIfsc ?? null,
          bankBranch: f.bankBranch ?? null,
        },
      });

      // Copy-from-existing: duplicate centre-scoped Service rows + InventoryItem
      // rows (without stock) into the new centre.
      let copiedServices = 0;
      let copiedProducts = 0;
      if (f.copyFromCentreId) {
        const sourceServices = await tx.service.findMany({
          where: { centreId: f.copyFromCentreId },
        });
        for (const s of sourceServices) {
          await tx.service.create({
            data: {
              name: s.name,
              hsnSacCode: s.hsnSacCode,
              basePrice: s.basePrice,
              gstRate: s.gstRate,
              participantCount: s.participantCount,
              serviceType: s.serviceType,
              departmentId: s.departmentId,
              centreId: centre.id,
              isActive: s.isActive,
            },
          });
          copiedServices++;
        }
        const sourceInventory = await tx.inventoryItem.findMany({
          where: { centreId: f.copyFromCentreId },
        });
        for (const item of sourceInventory) {
          await tx.inventoryItem.create({
            data: {
              productId: item.productId,
              centreId: centre.id,
              supplierName: item.supplierName,
              supplyPrice: item.supplyPrice,
              sellingPrice: item.sellingPrice,
              stock: 0, // start fresh; admin records stock-in after open
              minStock: item.minStock,
            },
          });
          copiedProducts++;
        }
      }

      return { centre, copiedServices, copiedProducts };
    });

    createdId = result.centre.id;
    await createAuditLog({
      action: "CREATE",
      entity: "Centre",
      entityId: result.centre.id,
      performedById: auth.user.id,
      metadata: {
        slug: result.centre.slug,
        copiedFromCentreId: f.copyFromCentreId,
        copiedServices: result.copiedServices,
        copiedProducts: result.copiedProducts,
      },
    });

    return NextResponse.json({
      ok: true,
      centreId: result.centre.id,
      copiedServices: result.copiedServices,
      copiedProducts: result.copiedProducts,
    });
  } catch (err) {
    if (err instanceof Error && err.message.match(/unique/i)) {
      return NextResponse.json({ error: "slug_taken" }, { status: 409 });
    }
    throw err;
  }
}
