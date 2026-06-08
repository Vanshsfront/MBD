// Create / list invoices. Three flavors: SERVICES (clinical, line items
// reference Services), PRODUCTS (line items reference Products), MANUAL
// (free-entry rows). Invoice numbering is allocated atomically per
// (centre, financial year) via allocateInvoiceNumber.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta, assertCentreScope } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";
import { allocateInvoiceNumber } from "@/lib/invoice-numbering";
import { computeInvoiceTotals, type DiscountType } from "@/lib/discount";
import { activeCentreId } from "@/lib/centre";

// `.strict()` rejects unknown body keys so a client can't smuggle
// server-derived fields (centreId, invoiceNumber, idempotencyKey,
// status, paidAmount) into the create payload. Reference: audit-2026-06-06
// AUTHZ-007 (defensive hardening).
const lineSchema = z
  .object({
    service: z.string().optional(),
    product: z.string().optional(),
    serviceId: z.string().optional(),
    productId: z.string().optional(),
    consultantId: z.string().optional(),
    consultantName: z.string().optional(),
    hsnSac: z.string().optional(),
    notes: z.string().optional(),
    qty: z.number().int().min(1),
    perAmount: z.number().min(0),
    lineDiscount: z.number().min(0).max(1).optional(),
    gstRate: z.number().min(0).max(1).default(0),
  })
  .strict();

const createSchema = z
  .object({
    clientId: z.string().min(1),
    invoiceFlavor: z.enum(["SERVICES", "PRODUCTS", "MANUAL"]).default("SERVICES"),
    invoiceType: z.enum(["INVOICE", "PROFORMA"]).default("INVOICE"),
    validTill: z.string().datetime().optional(),
    referredBy: z.string().max(120).optional(),
    lineItems: z.array(lineSchema).min(1),
    discountPercent: z.number().min(0).max(100).default(0),
    discountType: z.enum(["PERCENT", "FLAT"]).default("PERCENT"),
    promotionCode: z.string().optional(),
  })
  .strict();

export async function POST(req: Request) {
  const auth = await requirePermission("billing:create_edit_invoice");
  if (!auth.ok) return auth.response;

  // Idempotency: a retried POST with the same Idempotency-Key header returns
  // the original invoice instead of double-creating. Reference: F-008.
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
  if (idempotencyKey) {
    const existing = await prisma.invoice.findUnique({
      where: { idempotencyKey },
      select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        totalAmount: existing.totalAmount,
        status: existing.status,
        replayed: true,
      });
    }
  }

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const client = await prisma.client.findUnique({
    where: { id: f.clientId },
    include: { centre: true, referralSource: true },
  });
  if (!client?.centre) {
    return NextResponse.json({ error: "client_or_centre_missing" }, { status: 400 });
  }
  const scope = await assertCentreScope(auth.user, client);
  if (scope) return scope;

  // Resolve consultant per line: if the form passed a consultantId, look up
  // the staff name; otherwise fall back to the FO who's creating the invoice.
  // The MIS row needs both the ID and a display name.
  const consultantIds = new Set<string>();
  for (const li of f.lineItems) {
    if (li.consultantId) consultantIds.add(li.consultantId);
  }
  const staffById = new Map<string, { id: string; name: string }>();
  if (consultantIds.size > 0) {
    const rows = await prisma.staff.findMany({
      where: { id: { in: Array.from(consultantIds) } },
      select: { id: true, name: true },
    });
    for (const r of rows) staffById.set(r.id, r);
  }

  // Products flavor: pre-flight inventory checks — every line must have a
  // productId, and the centre's InventoryItem must hold enough stock.
  const inventoryByProduct = new Map<
    string,
    { id: string; stock: number; productName: string; sellingPrice: number; hsnSacCode: string | null }
  >();
  if (f.invoiceFlavor === "PRODUCTS") {
    const productIds = f.lineItems.map((l) => l.productId).filter((x): x is string => !!x);
    if (productIds.length !== f.lineItems.length) {
      return NextResponse.json({ error: "products_invoice_missing_productId" }, { status: 400 });
    }
    const items = await prisma.inventoryItem.findMany({
      where: { centreId: client.centre.id, productId: { in: productIds } },
      select: {
        id: true,
        productId: true,
        stock: true,
        sellingPrice: true,
        product: { select: { name: true, hsnSacCode: true } },
      },
    });
    for (const it of items) {
      inventoryByProduct.set(it.productId, {
        id: it.id,
        stock: it.stock,
        productName: it.product.name,
        sellingPrice: it.sellingPrice,
        hsnSacCode: it.product.hsnSacCode,
      });
    }
    // Tally per-product to handle the same product appearing on multiple lines.
    const totalQtyByProduct = new Map<string, number>();
    for (const li of f.lineItems) {
      const pid = li.productId!;
      totalQtyByProduct.set(pid, (totalQtyByProduct.get(pid) ?? 0) + li.qty);
    }
    for (const [pid, totalQty] of totalQtyByProduct) {
      const inv = inventoryByProduct.get(pid);
      if (!inv) {
        // Resolve the product name for a user-friendly error — the inventory
        // lookup missed because the product isn't stocked at this centre,
        // but the product itself probably exists in the global catalog.
        const product = await prisma.product.findUnique({
          where: { id: pid },
          select: { name: true },
        });
        return NextResponse.json(
          {
            error: "product_not_in_centre_inventory",
            productId: pid,
            productName: product?.name,
          },
          { status: 400 },
        );
      }
      if (inv.stock < totalQty) {
        return NextResponse.json(
          {
            error: "insufficient_stock",
            productId: pid,
            productName: inv.productName,
            available: inv.stock,
            requested: totalQty,
          },
          { status: 409 },
        );
      }
    }
  }

  // patientType: "New" if first invoice for this client in this centre.
  const priorInvoiceCount = await prisma.invoice.count({
    where: { clientId: f.clientId, centreId: client.centre.id },
  });
  const resolvedPatientType = priorInvoiceCount === 0 ? "New" : "Existing";

  const promo = f.promotionCode
    ? await prisma.promotion.findUnique({ where: { code: f.promotionCode } })
    : null;

  const totals = computeInvoiceTotals({
    lines: f.lineItems.map((l) => ({
      qty: l.qty,
      perAmount: l.perAmount,
      lineDiscountFraction: l.lineDiscount ?? 0,
      gstRate: l.gstRate,
    })),
    additionalDiscount:
      f.discountPercent > 0
        ? { type: f.discountType as DiscountType, value: f.discountPercent }
        : undefined,
    promotion:
      promo && promo.isActive
        ? {
            type: promo.discountType as DiscountType,
            value: promo.discountValue,
            maxAmount: promo.maxDiscount,
          }
        : undefined,
  });

  const meta = requestMeta(req);

  const result = await prisma.$transaction(async (tx) => {
    const numberAlloc = await allocateInvoiceNumber({
      centreId: client.centre!.id,
      centreSlug: client.centre!.slug,
    });

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: numberAlloc.invoiceNumber,
        invoiceFlavor: f.invoiceFlavor,
        invoiceType: f.invoiceType,
        validTill: f.validTill ? new Date(f.validTill) : null,
        referredBy: f.referredBy ?? null,
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        discountPercent: f.discountPercent,
        discountAmount: totals.discountAmount,
        discountType: f.discountType,
        promotionId: promo?.id ?? null,
        promotionCode: promo?.code ?? null,
        promotionDiscount: totals.promotionDiscount,
        status: f.invoiceType === "PROFORMA" ? "DRAFT" : "SENT",
        lineItems: JSON.stringify(
          f.lineItems.map((l) => ({
            ...l,
            lineTotal: l.qty * l.perAmount * (1 - (l.lineDiscount ?? 0)),
          })),
        ),
        clientId: f.clientId,
        centreId: client.centre!.id,
        idempotencyKey: idempotencyKey,
      },
    });

    // MIS rows. Allocate the invoice-level (additional + promo) discount across
    // lines by the same ratio computeInvoiceTotals uses, so the MIS rows
    // reconcile to the invoice total and the discount column reflects reality.
    const misRound2 = (n: number) => Math.round(n * 100) / 100;
    const misRatio = totals.subtotal > 0 ? totals.amountBeforeTax / totals.subtotal : 1;
    for (let i = 0; i < f.lineItems.length; i++) {
      const li = f.lineItems[i]!;
      const gross = li.qty * li.perAmount;
      const netLine = gross * (1 - (li.lineDiscount ?? 0));
      const lineAfterAll = misRound2(netLine * misRatio);
      const gst = misRound2(lineAfterAll * li.gstRate);
      const consultantId = li.consultantId ?? auth.user.id;
      const consultantName =
        li.consultantName ??
        staffById.get(li.consultantId ?? "")?.name ??
        auth.user.name ??
        "—";
      await tx.misEntry.create({
        data: {
          invoiceId: invoice.id,
          invoiceLineIndex: i,
          clientId: f.clientId,
          centreId: client.centre!.id,
          centreName: client.centre!.name,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.createdAt,
          patientName: `${client.firstName} ${client.lastName}`,
          patientType: resolvedPatientType,
          customerType: client.customerType,
          referralSourceName:
            client.referralSource?.name ?? client.referredByName ?? null,
          consultantId,
          consultant: consultantName,
          service: li.service ?? li.product ?? null,
          type: f.invoiceFlavor === "PRODUCTS" ? "Product" : "Clinic",
          amount: misRound2(gross),
          discount: misRound2(gross - lineAfterAll),
          amountBeforeTax: lineAfterAll,
          gstPercent: li.gstRate * 100,
          gst,
          netPayableAmount: misRound2(lineAfterAll + gst),
          perSessionAmount: li.perAmount,
          noOfSessions: li.qty,
          sessionNo: 1,
          paidAmount: 0,
          balanceAmount: misRound2(lineAfterAll + gst),
        },
      });
    }

    // Products flavor: decrement InventoryItem.stock + write a SOLD log row
    // per line (same transaction so a failed write rolls back the invoice).
    if (f.invoiceFlavor === "PRODUCTS") {
      for (const li of f.lineItems) {
        const inv = inventoryByProduct.get(li.productId!);
        if (!inv) continue; // pre-flight already validated; defensive only.
        await tx.inventoryItem.update({
          where: { id: inv.id },
          data: { stock: { decrement: li.qty } },
        });
        await tx.inventoryLog.create({
          data: {
            inventoryItemId: inv.id,
            action: "SOLD",
            quantity: -li.qty,
            invoiceId: invoice.id,
            performedById: auth.user.id,
            notes: `Sold via ${invoice.invoiceNumber}`,
          },
        });
      }
    }

    return invoice;
  });

  await createAuditLog({
    action: "CREATE",
    entity: "Invoice",
    entityId: result.id,
    performedById: auth.user.id,
    metadata: {
      invoiceNumber: result.invoiceNumber,
      flavor: f.invoiceFlavor,
      totalAmount: totals.totalAmount,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    invoiceId: result.id,
    invoiceNumber: result.invoiceNumber,
    totalAmount: totals.totalAmount,
  });
}

export async function GET(_req: Request) {
  const auth = await requirePermission("billing:view_invoices");
  if (!auth.ok) return auth.response;

  const centreId = await activeCentreId();
  const invoices = await prisma.invoice.findMany({
    where: centreId ? { centreId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { client: { select: { firstName: true, lastName: true, clientCode: true } } },
  });

  return NextResponse.json(
    invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      flavor: inv.invoiceFlavor,
      type: inv.invoiceType,
      status: inv.status,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      createdAt: inv.createdAt.toISOString(),
      client: {
        code: inv.client.clientCode,
        name: `${inv.client.firstName} ${inv.client.lastName}`,
      },
    })),
  );
}
