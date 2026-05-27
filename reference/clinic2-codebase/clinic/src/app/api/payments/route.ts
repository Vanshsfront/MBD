import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { applyPaymentToMisEntries } from "@/lib/mis";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("invoiceId");

    const where: Record<string, unknown> = {};
    if (invoiceId) where.invoiceId = invoiceId;

    const payments = await prisma.payment.findMany({
      where,
      include: {
        invoice: { include: { client: true } },
      },
      orderBy: { paymentDate: "desc" },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("[GET /api/payments]", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { invoiceId, amount, method, reference, performedById } = body;

    if (!invoiceId || !amount || !method) {
      return NextResponse.json({ error: "invoiceId, amount, and method are required" }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amount: parseFloat(amount),
        method,
        reference: reference || null,
      },
      include: { invoice: true },
    });

    // Update invoice paid amount and status
    const newPaidAmount = invoice.paidAmount + parseFloat(amount);
    let newStatus = invoice.status;
    if (newPaidAmount >= invoice.totalAmount) {
      newStatus = "PAID";
    } else if (newPaidAmount > 0) {
      newStatus = "PARTIAL";
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
      },
    });

    // Create part-payment reminder alert if payment is partial
    if (newStatus === "PARTIAL") {
      const remainingAmount = invoice.totalAmount - newPaidAmount;
      await prisma.alert.create({
        data: {
          type: "PART_PAYMENT_REMINDER",
          message: `Part payment of ₹${parseFloat(amount).toLocaleString()} received for Invoice ${invoice.invoiceNumber}. Remaining balance: ₹${remainingAmount.toLocaleString()}. Client: ${invoice.client.firstName} ${invoice.client.lastName}`,
          clientId: invoice.clientId,
        },
      });

      // Also notify front office staff via notifications
      const foStaff = await prisma.staff.findMany({
        where: { role: "FRONT_OFFICE", isActive: true },
        select: { id: true },
      });
      if (foStaff.length > 0) {
        const clientName = `${invoice.client.firstName} ${invoice.client.lastName}`;
        await prisma.notification.createMany({
          data: foStaff.map(s => ({
            targetUserId: s.id,
            type: "PARTIAL_PAYMENT",
            title: `Partial payment received from ${clientName}`,
            message: `₹${parseFloat(amount).toLocaleString()} received on Invoice ${invoice.invoiceNumber}. Outstanding balance: ₹${remainingAmount.toLocaleString()}.`,
            priority: "NORMAL" as const,
            clientId: invoice.clientId,
          })),
        });
      }
    }

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entity: "Payment",
      entityId: payment.id,
      performedById,
      metadata: { invoiceId, amount: parseFloat(amount), method, newStatus, invoiceNumber: invoice.invoiceNumber },
    });

    // Reflect the new paid/balance/mode on every MIS row tied to this invoice.
    try {
      await applyPaymentToMisEntries(invoiceId);
    } catch (misError) {
      console.error("[POST /api/payments] MIS update failed:", misError);
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("[POST /api/payments]", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
