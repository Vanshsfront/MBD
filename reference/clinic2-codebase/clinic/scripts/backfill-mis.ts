// One-shot backfill: snapshot a MisEntry row for every existing invoice so the
// new MIS report shows historical data. Safe to re-run — invoices that already
// have entries are skipped.
//
// Run via: set -a && source .env.local && set +a && npx tsx scripts/backfill-mis.ts

import { prisma } from "../src/lib/prisma";
import { createMisEntriesForInvoice, applyPaymentToMisEntries } from "../src/lib/mis";

async function main() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "asc" },
    include: { package: true, payments: true },
  });

  let created = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const existing = await prisma.misEntry.count({ where: { invoiceId: inv.id } });
    if (existing > 0) {
      skipped++;
      continue;
    }

    let lineItems: Array<{
      service?: string;
      consultant?: string;
      sessions?: number;
      perSessionAmount?: number;
      discountPercent?: number;
      gstRate?: number;
      subtotal?: number;
      gstAmount?: number;
      total?: number;
    }> = [];
    try {
      lineItems = typeof inv.lineItems === "string" ? JSON.parse(inv.lineItems) : [];
    } catch {
      lineItems = [];
    }

    await createMisEntriesForInvoice({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      invoiceDate: inv.createdAt,
      clientId: inv.clientId,
      centreId: inv.centreId,
      lineItems,
      totalAmount: inv.totalAmount,
      paidAmount: 0,
      performedById: null,
      packageStartDate: inv.package?.validFrom || null,
      remark1: inv.referredBy || null,
    });

    if ((inv.paidAmount || 0) > 0) {
      await applyPaymentToMisEntries(inv.id);
    }

    created++;
  }

  console.log(`Backfilled ${created} invoices into MisEntry. Skipped ${skipped} already-snapshotted.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
