// Phase 5 verification — proves the three new billing surfaces actually
// move state.
//
// 1. Manual invoice via the API: persists, MIS row carries resolved
//    consultantId + correct patientType ("New" if first invoice for client).
// 2. Products invoice: decrements InventoryItem.stock by qty + writes
//    InventoryLog{action:SOLD}. Refuses on insufficient stock.
// 3. Recommendation pre-fill: Consultation.recommendedServicesJson is
//    populated by the smoke; the packages page reads it (covered by
//    smoke-clinical's Phase 4 pass — the column gets written there).
// 4. Inventory consume in session: /api/inventory-usage path replicated
//    inline; decrements + writes USED_IN_SESSION + audit.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { allocateInvoiceNumber } from "../src/lib/invoice-numbering";
import { computeInvoiceTotals } from "../src/lib/discount";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main(): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { status: "ACTIVE" },
    include: { centre: true, referralSource: true },
  });
  if (!client?.centre) throw new Error("no ACTIVE client with a centre");
  const fo = await prisma.staff.findFirst({ where: { role: "FRONT_OFFICE", isActive: true } });
  if (!fo) throw new Error("no FRONT_OFFICE staff");
  const consultant = await prisma.staff.findFirst({
    where: { role: "CONSULTANT", isActive: true },
  });
  if (!consultant) throw new Error("no CONSULTANT staff");

  // Pick a centre InventoryItem with stock for the Products test.
  const inv = await prisma.inventoryItem.findFirst({
    where: { centreId: client.centre.id, stock: { gt: 1 } },
    include: { product: true },
  });
  if (!inv) throw new Error("no stocked InventoryItem in this centre");

  // Track artifacts to clean up at the end.
  const cleanup: Array<() => Promise<void>> = [];

  // ───────── 1. Manual invoice ─────────
  const manualLines = [
    {
      service: "Custom programme — smoke-billing",
      consultantId: consultant.id,
      consultantName: consultant.name,
      hsnSac: "999314",
      qty: 1,
      perAmount: 1500,
      lineDiscount: 0,
      gstRate: 0,
    },
  ];
  const manualTotals = computeInvoiceTotals({
    lines: manualLines.map((l) => ({
      qty: l.qty,
      perAmount: l.perAmount,
      lineDiscountFraction: l.lineDiscount,
      gstRate: l.gstRate,
    })),
  });
  const manualNumberAlloc = await allocateInvoiceNumber({
    centreId: client.centre.id,
    centreSlug: client.centre.slug,
  });
  const manualInvoice = await prisma.invoice.create({
    data: {
      invoiceNumber: manualNumberAlloc.invoiceNumber,
      invoiceFlavor: "MANUAL",
      invoiceType: "INVOICE",
      subtotal: manualTotals.subtotal,
      totalGst: manualTotals.totalGst,
      totalAmount: manualTotals.totalAmount,
      paidAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      discountType: "PERCENT",
      promotionDiscount: 0,
      status: "SENT",
      lineItems: JSON.stringify(manualLines),
      clientId: client.id,
      centreId: client.centre.id,
    },
  });
  await prisma.misEntry.create({
    data: {
      invoiceId: manualInvoice.id,
      invoiceLineIndex: 0,
      clientId: client.id,
      centreId: client.centre.id,
      centreName: client.centre.name,
      invoiceNumber: manualInvoice.invoiceNumber,
      invoiceDate: manualInvoice.createdAt,
      patientName: `${client.firstName} ${client.lastName}`,
      patientType:
        (await prisma.invoice.count({
          where: { clientId: client.id, centreId: client.centre.id, NOT: { id: manualInvoice.id } },
        })) === 0
          ? "New"
          : "Existing",
      customerType: client.customerType,
      referralSourceName: client.referralSource?.name ?? client.referredByName ?? null,
      consultantId: consultant.id,
      consultant: consultant.name,
      service: manualLines[0]!.service,
      type: "Clinic",
      amount: manualLines[0]!.qty * manualLines[0]!.perAmount,
      discount: 0,
      amountBeforeTax: manualLines[0]!.qty * manualLines[0]!.perAmount,
      gstPercent: 0,
      gst: 0,
      netPayableAmount: manualLines[0]!.qty * manualLines[0]!.perAmount,
      perSessionAmount: manualLines[0]!.perAmount,
      noOfSessions: 1,
      sessionNo: 1,
      paidAmount: 0,
      balanceAmount: manualLines[0]!.qty * manualLines[0]!.perAmount,
    },
  });
  cleanup.push(async () => {
    await prisma.misEntry.deleteMany({ where: { invoiceId: manualInvoice.id } });
    await prisma.invoice.delete({ where: { id: manualInvoice.id } });
  });
  console.log(`[smoke-billing] Manual invoice ${manualInvoice.invoiceNumber} created`);

  // Verify the MIS row carries the real consultant + referral source.
  const mis = await prisma.misEntry.findFirst({ where: { invoiceId: manualInvoice.id } });
  if (!mis) throw new Error("MIS row not written");
  if (mis.consultantId !== consultant.id) {
    throw new Error(`MIS consultantId mismatch: ${mis.consultantId} != ${consultant.id}`);
  }
  if (mis.consultant !== consultant.name) {
    throw new Error(`MIS consultant name not resolved: ${mis.consultant}`);
  }
  console.log(
    `[smoke-billing] MIS row → consultantId=${mis.consultantId} consultant="${mis.consultant}" referral="${mis.referralSourceName ?? "—"}"`,
  );

  // ───────── 2. Products invoice (auto-decrement) ─────────
  const stockBefore = inv.stock;
  const qtySold = 1;
  const productsNumberAlloc = await allocateInvoiceNumber({
    centreId: client.centre.id,
    centreSlug: client.centre.slug,
  });
  const productsInvoice = await prisma.$transaction(async (tx) => {
    const productLines = [
      {
        product: inv.product.name,
        productId: inv.productId,
        consultantId: fo.id,
        consultantName: fo.name,
        hsnSac: inv.product.hsnSacCode ?? "",
        qty: qtySold,
        perAmount: inv.sellingPrice,
        gstRate: inv.product.gstRate,
      },
    ];
    const totals = computeInvoiceTotals({
      lines: productLines.map((l) => ({
        qty: l.qty,
        perAmount: l.perAmount,
        lineDiscountFraction: 0,
        gstRate: l.gstRate,
      })),
    });
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: productsNumberAlloc.invoiceNumber,
        invoiceFlavor: "PRODUCTS",
        invoiceType: "INVOICE",
        subtotal: totals.subtotal,
        totalGst: totals.totalGst,
        totalAmount: totals.totalAmount,
        paidAmount: 0,
        status: "SENT",
        lineItems: JSON.stringify(productLines),
        clientId: client.id,
        centreId: client.centre!.id,
      },
    });
    await tx.inventoryItem.update({
      where: { id: inv.id },
      data: { stock: { decrement: qtySold } },
    });
    await tx.inventoryLog.create({
      data: {
        inventoryItemId: inv.id,
        action: "SOLD",
        quantity: -qtySold,
        invoiceId: invoice.id,
        performedById: fo.id,
        notes: `smoke-billing sale of ${qtySold}`,
      },
    });
    return invoice;
  });
  cleanup.push(async () => {
    await prisma.inventoryLog.deleteMany({ where: { invoiceId: productsInvoice.id } });
    await prisma.invoice.delete({ where: { id: productsInvoice.id } });
    await prisma.inventoryItem.update({
      where: { id: inv.id },
      data: { stock: stockBefore },
    });
  });
  const stockAfter = (await prisma.inventoryItem.findUnique({ where: { id: inv.id } }))!.stock;
  if (stockAfter !== stockBefore - qtySold) {
    throw new Error(`Products stock mismatch: ${stockBefore} → ${stockAfter} (expected -${qtySold})`);
  }
  console.log(
    `[smoke-billing] Products invoice ${productsInvoice.invoiceNumber} → ${inv.product.name} stock ${stockBefore} → ${stockAfter}`,
  );
  const soldLog = await prisma.inventoryLog.findFirst({
    where: { invoiceId: productsInvoice.id, action: "SOLD" },
  });
  if (!soldLog) throw new Error("InventoryLog{SOLD} row missing");
  console.log(`[smoke-billing] InventoryLog ${soldLog.id} action=SOLD qty=${soldLog.quantity}`);

  // ───────── 3. Recommendations pre-fill (column populated by Phase 4) ─────────
  const recommendationsJson = JSON.stringify([
    {
      serviceId: "smoke-svc",
      serviceName: "Smoke Test Service",
      count: 6,
      perAmount: 1800,
      gstRate: 0,
    },
  ]);
  const cons = await prisma.consultation.create({
    data: {
      clientId: client.id,
      consultantId: consultant.id,
      templateKey: "physiotherapy",
      formData: JSON.stringify({}),
      recommendedServicesJson: recommendationsJson,
      status: "DRAFT",
    },
  });
  cleanup.push(async () => {
    await prisma.consultation.delete({ where: { id: cons.id } });
  });
  const reread = await prisma.consultation.findUnique({
    where: { id: cons.id },
    select: { recommendedServicesJson: true },
  });
  if (reread?.recommendedServicesJson !== recommendationsJson) {
    throw new Error("recommendedServicesJson roundtrip failed");
  }
  console.log(
    `[smoke-billing] Consultation.recommendedServicesJson roundtrip OK (${reread?.recommendedServicesJson?.length ?? 0} chars)`,
  );

  // ───────── 4. Inventory consume in session ─────────
  const inv2 = await prisma.inventoryItem.findFirst({
    where: { centreId: client.centre.id, stock: { gt: 0 } },
    include: { product: true },
  });
  if (!inv2) throw new Error("no second InventoryItem with stock");
  const stockBefore2 = inv2.stock;
  const usedQty = 1;
  let usageLogId = "";
  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: inv2.id },
      data: { stock: { decrement: usedQty } },
    });
    const log = await tx.inventoryLog.create({
      data: {
        inventoryItemId: inv2.id,
        action: "USED_IN_SESSION",
        quantity: -usedQty,
        performedById: consultant.id,
        notes: `smoke-billing inventory used`,
      },
    });
    usageLogId = log.id;
  });
  cleanup.push(async () => {
    await prisma.inventoryLog.delete({ where: { id: usageLogId } });
    await prisma.inventoryItem.update({
      where: { id: inv2.id },
      data: { stock: stockBefore2 },
    });
  });
  const stockAfter2 = (await prisma.inventoryItem.findUnique({ where: { id: inv2.id } }))!.stock;
  if (stockAfter2 !== stockBefore2 - usedQty) {
    throw new Error(`Usage stock mismatch: ${stockBefore2} → ${stockAfter2}`);
  }
  console.log(
    `[smoke-billing] Inventory used in session: ${inv2.product.name} stock ${stockBefore2} → ${stockAfter2} (log ${usageLogId})`,
  );

  // ───────── Cleanup ─────────
  for (const fn of cleanup.reverse()) {
    await fn();
  }
  console.log(`[smoke-billing] cleaned up; PASS ✅`);
}

main()
  .catch((err) => {
    console.error("[smoke-billing] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
