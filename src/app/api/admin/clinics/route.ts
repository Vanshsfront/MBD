// Centres CRUD with copy-from-existing for services + products.
// PRD §3.1 admin:manage_clinics — OWNER + DEV only.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { parseAddress } from "@/lib/address";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(20).regex(/^[A-Z0-9-]+$/, "uppercase + dashes"),
  location: z.string().min(1).max(200),
  state: z.string().min(1).max(80),
  contactPhone: z.string().max(40).optional(),
  gstNumber: z.string().max(40).optional(),
  panNumber: z.string().max(20).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankIfsc: z.string().max(20).optional(),
  bankBranch: z.string().max(120).optional(),
  copyFromCentreId: z.string().optional(),
});

// Edit an existing centre. Same fields as create minus slug (baked into client
// codes and invoice numbers) and copyFromCentreId (a create-time-only action).
// A centre set up before `state` was collected has no state on file, which
// blocks invoice/package creation with a message pointing here — so this
// endpoint is what makes that message actionable.
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  location: z.string().min(1).max(200).optional(),
  state: z.string().min(1).max(80).optional(),
  contactPhone: z.string().max(40).nullish(),
  gstNumber: z.string().max(40).nullish(),
  panNumber: z.string().max(20).nullish(),
  bankName: z.string().max(120).nullish(),
  bankAccountNumber: z.string().max(40).nullish(),
  bankIfsc: z.string().max(20).nullish(),
  bankBranch: z.string().max(120).nullish(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:manage_clinics");
  if (!auth.ok) return auth.response;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.centre.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (f.name !== undefined) data.name = f.name;
  if (f.location !== undefined) data.location = f.location;
  if (f.contactPhone !== undefined) data.contactPhone = f.contactPhone ?? null;
  if (f.gstNumber !== undefined) data.gstNumber = f.gstNumber ?? null;
  if (f.panNumber !== undefined) data.panNumber = f.panNumber ?? null;
  if (f.bankName !== undefined) data.bankName = f.bankName ?? null;
  if (f.bankAccountNumber !== undefined) data.bankAccountNumber = f.bankAccountNumber ?? null;
  if (f.bankIfsc !== undefined) data.bankIfsc = f.bankIfsc ?? null;
  if (f.bankBranch !== undefined) data.bankBranch = f.bankBranch ?? null;
  if (f.isActive !== undefined) data.isActive = f.isActive;

  // State lives inside the address JSON blob, not its own column. Merge so a
  // centre that already carries line2/city/pincode doesn't lose them when only
  // the state is corrected.
  const currentAddress = parseAddress(existing.address) ?? {};
  if (f.state !== undefined || f.location !== undefined) {
    data.address = JSON.stringify({
      ...currentAddress,
      ...(f.location !== undefined ? { line1: f.location } : {}),
      ...(f.state !== undefined ? { state: f.state } : {}),
    });
  }

  const updated = await prisma.centre.update({ where: { id: f.id }, data });

  const snapshot = (c: typeof existing) => ({
    name: c.name,
    location: c.location,
    state: parseAddress(c.address)?.state ?? null,
    contactPhone: c.contactPhone,
    gstNumber: c.gstNumber,
    panNumber: c.panNumber,
    bankName: c.bankName,
    bankAccountNumber: c.bankAccountNumber,
    bankIfsc: c.bankIfsc,
    bankBranch: c.bankBranch,
    isActive: c.isActive,
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Centre",
    entityId: f.id,
    performedById: auth.user.id,
    changes: computeChanges(snapshot(existing), snapshot(updated)),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}

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
          address: JSON.stringify({ line1: f.location, state: f.state }),
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
