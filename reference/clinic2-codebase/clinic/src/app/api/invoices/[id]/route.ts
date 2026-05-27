import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { calculateBilling } from "@/lib/billing";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        package: true,
        payments: { orderBy: { paymentDate: "desc" } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("[GET /api/invoices/:id]", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Prevent editing paid invoices (data integrity)
    if (existing.status === "PAID" && body.status !== "PAID") {
      // Allow status-only changes even on paid invoices (e.g. reopening)
    }

    // Build update data — only include fields that were explicitly sent
    const updateData: Record<string, unknown> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.sacNumber !== undefined) updateData.sacNumber = body.sacNumber || null;
    if (body.hslNumber !== undefined) updateData.hslNumber = body.hslNumber || null;
    if (body.referredBy !== undefined) updateData.referredBy = body.referredBy || null;

    // If lineItems are being updated, recalculate totals
    if (body.lineItems) {
      const billing = calculateBilling(body.lineItems);
      const discountType = body.discountType || existing.discountType;
      const discountPercent = body.discountPercent ?? existing.discountPercent;
      const discountAmountFlat = body.discountAmount ?? existing.discountAmount;

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

      updateData.lineItems = JSON.stringify(billing.lineItems);
      updateData.subtotal = finalSubtotal;
      updateData.totalGst = finalGst;
      updateData.totalAmount = finalSubtotal + finalGst;
      updateData.discountPercent = discountPercent;
      updateData.discountAmount = appliedDiscountAmount;
      updateData.discountType = discountType;
    } else {
      // Discount-only update
      if (body.discountType !== undefined) updateData.discountType = body.discountType;
      if (body.discountPercent !== undefined) updateData.discountPercent = body.discountPercent;
      if (body.discountAmount !== undefined) updateData.discountAmount = body.discountAmount;
    }

    if (body.inventoryItems !== undefined) {
      updateData.inventoryItems = body.inventoryItems ? JSON.stringify(body.inventoryItems) : null;
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: { client: true, package: true, payments: true },
    });

    // Notify front office when invoice becomes OVERDUE
    if (body.status === "OVERDUE" && existing.status !== "OVERDUE") {
      const foStaff = await prisma.staff.findMany({
        where: { role: "FRONT_OFFICE", isActive: true },
        select: { id: true },
      });
      if (foStaff.length > 0) {
        const clientName = `${invoice.client.firstName} ${invoice.client.lastName}`;
        const balance = invoice.totalAmount - invoice.paidAmount;
        await prisma.notification.createMany({
          data: foStaff.map(s => ({
            targetUserId: s.id,
            type: "OVERDUE_INVOICE",
            title: `Overdue invoice for ${clientName}`,
            message: `Invoice ${existing.invoiceNumber} (₹${balance.toLocaleString()} outstanding) for ${clientName} is now overdue. Please follow up on payment.`,
            priority: "HIGH" as const,
            clientId: invoice.clientId,
          })),
        });
      }
    }

    // Audit trail — auto-diff all fields
    const changes = computeChanges(existing as Record<string, unknown>, invoice as unknown as Record<string, unknown>);
    await createAuditLog({
      action: "UPDATE",
      entity: "Invoice",
      entityId: id,
      performedById: body.performedById,
      changes,
      metadata: { invoiceNumber: existing.invoiceNumber },
    });

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("[PUT /api/invoices/:id]", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
