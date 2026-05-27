// Record a Payment against an Invoice. Updates Invoice.paidAmount and
// flips status to PAID/PARTIAL accordingly. Updates MisEntry snapshots
// (paidAmount, balanceAmount, modeOfPayment, reference) proportionally
// across line items so the MIS report stays correct.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const createSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "CHEQUE", "NEFT", "UPI", "RAZORPAY", "OTHER"]),
  reference: z.string().max(120).optional(),
  paymentDateIso: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const auth = await requirePermission("billing:record_payment");
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

  const invoice = await prisma.invoice.findUnique({
    where: { id: f.invoiceId },
    include: { misEntries: true },
  });
  if (!invoice) return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  if (invoice.status === "CANCELLED")
    return NextResponse.json({ error: "invoice_cancelled" }, { status: 400 });

  const newPaid = invoice.paidAmount + f.amount;
  const remaining = Math.max(0, invoice.totalAmount - newPaid);
  const newStatus =
    newPaid >= invoice.totalAmount ? "PAID" : newPaid > 0 ? "PARTIAL" : invoice.status;

  const meta = requestMeta(req);
  const paidAt = f.paymentDateIso ? new Date(f.paymentDateIso) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: f.amount,
        method: f.method,
        reference: f.reference ?? null,
        recordedById: auth.user.id,
        paymentDate: paidAt,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaid, status: newStatus },
    });

    // Update MIS entries proportionally. Each entry's share of the new
    // payment is amount * (entry.netPayable / total).
    const total = invoice.totalAmount;
    if (total > 0) {
      for (const m of invoice.misEntries) {
        const share = m.netPayableAmount / total;
        const allocated = f.amount * share;
        await tx.misEntry.update({
          where: { id: m.id },
          data: {
            paidAmount: { increment: allocated },
            balanceAmount: { decrement: allocated },
            modeOfPayment: f.method,
            reference: f.reference ?? null,
          },
        });
      }
    }

    return payment;
  });

  await createAuditLog({
    action: "CREATE",
    entity: "Payment",
    entityId: result.id,
    performedById: auth.user.id,
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: f.amount,
      method: f.method,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "Invoice",
    entityId: invoice.id,
    performedById: auth.user.id,
    changes: {
      paidAmount: { old: invoice.paidAmount, new: newPaid },
      status: { old: invoice.status, new: newStatus },
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    paymentId: result.id,
    paidAmount: newPaid,
    remaining,
    status: newStatus,
  });
}

export async function GET(_req: Request) {
  const auth = await requirePermission("billing:view_payments");
  if (!auth.ok) return auth.response;

  const payments = await prisma.payment.findMany({
    orderBy: { paymentDate: "desc" },
    take: 100,
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          client: { select: { firstName: true, lastName: true, clientCode: true } },
        },
      },
    },
  });
  return NextResponse.json(
    payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      paymentDate: p.paymentDate.toISOString(),
      invoiceNumber: p.invoice.invoiceNumber,
      invoiceStatus: p.invoice.status,
      client: `${p.invoice.client.firstName} ${p.invoice.client.lastName}`,
    })),
  );
}
