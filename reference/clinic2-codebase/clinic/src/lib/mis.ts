import { prisma } from "@/lib/prisma";

export interface MisLineItem {
  service?: string;
  consultant?: string;
  sessions?: number;
  perSessionAmount?: number;
  discountPercent?: number;
  gstRate?: number;
  subtotal?: number;
  gstAmount?: number;
  total?: number;
}

export interface CreateMisEntriesInput {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: string;
  invoiceDate: Date;
  clientId: string;
  centreId: string | null;
  lineItems: MisLineItem[];
  totalAmount: number;
  paidAmount?: number;
  performedById?: string | null;
  packageStartDate?: Date | null;
  remark1?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Snapshot one MIS row per invoice line item. Frozen at invoice creation —
// payment fields are mutated later via applyPaymentToMisEntries.
export async function createMisEntriesForInvoice(input: CreateMisEntriesInput) {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    include: { centre: true, referralSource: true },
  });
  if (!client) return;

  const priorInvoices = await prisma.invoice.findMany({
    where: { clientId: input.clientId, id: { not: input.invoiceId } },
    select: { totalAmount: true, paidAmount: true, createdAt: true },
  });
  const patientType = priorInvoices.length === 0 ? "New" : "Existing";
  const previousDues = priorInvoices.reduce(
    (s, i) => s + Math.max(0, i.totalAmount - i.paidAmount),
    0
  );
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const previousMonthDues = priorInvoices
    .filter((i) => i.createdAt >= monthAgo)
    .reduce((s, i) => s + Math.max(0, i.totalAmount - i.paidAmount), 0);

  const performedBy = input.performedById
    ? await prisma.staff.findUnique({
        where: { id: input.performedById },
        select: { name: true },
      })
    : null;

  const items: MisLineItem[] = input.lineItems.length > 0
    ? input.lineItems
    : [{ service: "N/A", sessions: 1, perSessionAmount: input.totalAmount, gstRate: 0 }];

  const serviceNames = Array.from(
    new Set(items.map((i) => i.service).filter((s): s is string => !!s))
  );
  const services = serviceNames.length
    ? await prisma.service.findMany({
        where: { name: { in: serviceNames } },
        include: { department: true },
      })
    : [];
  const deptByName = new Map(services.map((s) => [s.name, s.department?.name || ""]));

  const totalPaidFromInvoice = input.paidAmount || 0;

  for (let i = 0; i < items.length; i++) {
    const li = items[i];
    const sessions = li.sessions || 1;
    const perSessionAmt = li.perSessionAmount || 0;
    const grossAmount = sessions * perSessionAmt;
    const discountPct = li.discountPercent || 0;
    const discount = grossAmount * (discountPct / 100);
    const amountBeforeTax = grossAmount - discount;
    const gstPct = (li.gstRate || 0) * 100;
    const gstAmt = li.gstAmount ?? amountBeforeTax * (li.gstRate || 0);
    const netPayable = li.total ?? amountBeforeTax + gstAmt;

    const lineRatio = items.length > 1 && input.totalAmount > 0
      ? netPayable / input.totalAmount
      : 1;
    const linePaid = totalPaidFromInvoice * lineRatio;
    const balance = Math.max(0, netPayable - linePaid);
    const excess = Math.max(0, linePaid - netPayable);

    await prisma.misEntry.create({
      data: {
        invoiceId: input.invoiceId,
        invoiceLineIndex: i,
        clientId: input.clientId,
        centreId: input.centreId,
        centreName: client.centre?.name || "Clinic",
        invoiceNumber: input.invoiceNumber,
        invoiceType: input.invoiceType,
        invoiceDate: input.invoiceDate,
        patientName: `${client.firstName} ${client.lastName}`,
        patientType,
        customerType: client.customerType,
        referralSourceName: client.referralSource?.name || null,
        consultant: li.consultant || null,
        service: li.service || null,
        department: deptByName.get(li.service || "") || null,
        amount: round2(grossAmount),
        discount: round2(discount),
        amountBeforeTax: round2(amountBeforeTax),
        gstPercent: round2(gstPct),
        gst: round2(gstAmt),
        netPayableAmount: round2(netPayable),
        perSessionAmount: round2(perSessionAmt),
        noOfSessions: sessions,
        sessionNo: i + 1,
        packageStartDate: input.packageStartDate || null,
        previousDues: round2(previousDues),
        previousMonthDues: round2(previousMonthDues),
        paidAmount: round2(linePaid),
        balanceAmount: round2(balance),
        excessAmount: round2(excess),
        remark1: input.remark1 || null,
        enteredById: input.performedById || null,
        enteredByName: performedBy?.name || null,
      },
    });
  }
}

// Refresh the payment-related fields on every MisEntry tied to this invoice.
// Called after a Payment is recorded.
export async function applyPaymentToMisEntries(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true, misEntries: true },
  });
  if (!invoice) return;

  const totalPaid = invoice.paidAmount || 0;
  const methods = Array.from(new Set(invoice.payments.map((p) => p.method))).join(", ") || null;
  const refs =
    invoice.payments
      .map((p) => p.reference)
      .filter((r): r is string => !!r)
      .join(", ") || null;

  for (const entry of invoice.misEntries) {
    const lineRatio = invoice.misEntries.length > 1 && invoice.totalAmount > 0
      ? entry.netPayableAmount / invoice.totalAmount
      : 1;
    const linePaid = totalPaid * lineRatio;
    const balance = Math.max(0, entry.netPayableAmount - linePaid);
    const excess = Math.max(0, linePaid - entry.netPayableAmount);

    await prisma.misEntry.update({
      where: { id: entry.id },
      data: {
        paidAmount: round2(linePaid),
        balanceAmount: round2(balance),
        excessAmount: round2(excess),
        modeOfPayment: methods,
        reference: refs,
      },
    });
  }
}
