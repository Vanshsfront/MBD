import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validators";
import { calculateBilling, calculatePromoDiscount } from "@/lib/billing";
import { generateInvoiceNumber } from "@/lib/id-generator";
import { createAuditLog } from "@/lib/audit";
import { createMisEntriesForInvoice } from "@/lib/mis";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const clientId = searchParams.get("clientId");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: true,
        package: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("[GET /api/invoices]", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = invoiceSchema.parse(body);

    const billing = calculateBilling(data.lineItems);

    // Look up the client's centre to prefix the invoice number with that clinic's slug.
    const clientForInvoice = await prisma.client.findUnique({
      where: { id: data.clientId },
      select: { centreId: true },
    });
    const invoiceNumber = await generateInvoiceNumber(clientForInvoice?.centreId || body.centreId || null);

    // Support both percentage and flat discounts
    const discountType = body.discountType || "PERCENT";
    const discountPercent = data.discountPercent || 0;
    const discountAmountFlat = body.discountAmount ? parseFloat(body.discountAmount) : 0;

    let finalSubtotal = billing.subtotal;
    let finalGst = billing.totalGst;
    let appliedDiscountAmount = 0;

    if (discountType === "FLAT" && discountAmountFlat > 0) {
      appliedDiscountAmount = discountAmountFlat;
      const discountRatio = Math.max(0, 1 - appliedDiscountAmount / billing.subtotal);
      finalSubtotal = billing.subtotal * discountRatio;
      finalGst = billing.totalGst * discountRatio;
    } else if (discountPercent > 0) {
      appliedDiscountAmount = billing.subtotal * (discountPercent / 100);
      finalSubtotal = billing.subtotal * (1 - discountPercent / 100);
      finalGst = billing.totalGst * (1 - discountPercent / 100);
    }

    // Promo — applied AFTER the manual discount. Second priority per client decision.
    let promoDiscount = 0;
    let promoCode: string | null = null;
    let promoId: string | null = null;
    if (body.promotionId) {
      const promo = await prisma.promotion.findUnique({ where: { id: body.promotionId } });
      if (!promo || !promo.isActive) {
        return NextResponse.json({ error: "Promotion not active" }, { status: 400 });
      }
      const now = new Date();
      if (promo.validFrom && now < promo.validFrom) {
        return NextResponse.json({ error: "Promotion not yet valid" }, { status: 400 });
      }
      if (promo.validUntil && now > promo.validUntil) {
        return NextResponse.json({ error: "Promotion has expired" }, { status: 400 });
      }
      if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
        return NextResponse.json({ error: "Promotion usage limit reached" }, { status: 400 });
      }
      promoDiscount = calculatePromoDiscount(finalSubtotal, {
        discountType: promo.discountType as "PERCENT" | "FLAT",
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
      });
      // Reduce subtotal + GST proportionally so GST stays correct
      const ratio = finalSubtotal > 0 ? Math.max(0, 1 - promoDiscount / finalSubtotal) : 1;
      finalSubtotal = finalSubtotal - promoDiscount;
      finalGst = finalGst * ratio;
      promoCode = promo.code;
      promoId = promo.id;
    }

    const finalTotal = finalSubtotal + finalGst;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        invoiceType: data.invoiceType,
        clientId: data.clientId,
        packageId: data.packageId || null,
        centreId: clientForInvoice?.centreId || body.centreId || null,
        subtotal: finalSubtotal,
        totalGst: finalGst,
        totalAmount: finalTotal,
        discountPercent: discountPercent,
        discountAmount: appliedDiscountAmount,
        discountType: discountType,
        promotionId: promoId,
        promotionCode: promoCode,
        promotionDiscount: promoDiscount,
        lineItems: JSON.stringify(billing.lineItems),
        inventoryItems: body.inventoryItems ? JSON.stringify(body.inventoryItems) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        validTill: data.validTill ? new Date(data.validTill) : null,
        referredBy: data.referredBy || null,
        sacNumber: body.sacNumber || null,
        hslNumber: body.hslNumber || null,
        status: "DRAFT",
      },
      include: { client: true, payments: true },
    });

    // Increment promo usage count
    if (promoId) {
      await prisma.promotion.update({ where: { id: promoId }, data: { usedCount: { increment: 1 } } });
    }

    // Audit log 
    await createAuditLog({
      action: "CREATE",
      entity: "Invoice",
      entityId: invoice.id,
      performedById: body.performedById,
      metadata: { invoiceNumber, totalAmount: finalTotal, discountType, discountPercent, discountAmount: appliedDiscountAmount },
    });

    // ── Auto-create Package from invoice line items ──────────────────────
    try {
      const parsedItems: Array<{ service: string; sessions: number; serviceId?: string }> =
        typeof billing.lineItems === "string" ? JSON.parse(billing.lineItems) : billing.lineItems;

      if (parsedItems.length > 0) {
        const totalSessions = parsedItems.reduce((sum, li) => sum + (li.sessions || 1), 0);

        // Build serviceMix — try to look up serviceId by name
        const serviceMixEntries = await Promise.all(
          parsedItems.map(async (li) => {
            let serviceId = li.serviceId || "";
            if (!serviceId && li.service) {
              const svc = await prisma.service.findFirst({ where: { name: li.service }, select: { id: true } });
              if (svc) serviceId = svc.id;
            }
            return { serviceId, serviceName: li.service, count: li.sessions || 1 };
          })
        );

        const validFrom = new Date();
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 90);

        const pkg = await prisma.package.create({
          data: {
            clientId: data.clientId,
            totalSessions,
            serviceMix: JSON.stringify(serviceMixEntries),
            validFrom,
            validUntil,
            totalPrice: finalTotal,
            discountPercent: discountPercent,
            discountAmount: appliedDiscountAmount,
          },
        });

        // Link the invoice to the package
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { packageId: pkg.id },
        });

        // Audit the package creation
        await createAuditLog({
          action: "CREATE",
          entity: "Package",
          entityId: pkg.id,
          performedById: body.performedById,
          metadata: { invoiceId: invoice.id, invoiceNumber, totalSessions, autoCreated: true },
        });
      }
    } catch (pkgError) {
      console.error("[POST /api/invoices] Auto-package creation failed:", pkgError);
      // Non-blocking — invoice is still created
    }

    // Re-fetch the invoice to include any package that was auto-created
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { client: true, payments: true, package: true },
    });

    // Snapshot one MIS row per line item — frozen at write time, payment fields
    // are mutated later when payments arrive.
    try {
      await createMisEntriesForInvoice({
        invoiceId: invoice.id,
        invoiceNumber,
        invoiceType: data.invoiceType,
        invoiceDate: invoice.createdAt,
        clientId: data.clientId,
        centreId: clientForInvoice?.centreId || body.centreId || null,
        lineItems: billing.lineItems,
        totalAmount: finalTotal,
        paidAmount: 0,
        performedById: body.performedById || null,
        packageStartDate: finalInvoice?.package?.validFrom || null,
        remark1: data.referredBy || null,
      });
    } catch (misError) {
      console.error("[POST /api/invoices] MIS snapshot failed:", misError);
      // Non-blocking — invoice creation must not fail because of MIS write.
    }

    return NextResponse.json(finalInvoice || invoice, { status: 201 });
  } catch (error) {
    console.error("[POST /api/invoices]", error);
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
