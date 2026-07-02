import { prisma } from "../src/lib/prisma";

async function run() {
  console.log("Starting MisEntry invoiceType backfill (idempotent)...");

  // Get all MisEntry rows, including their parent Invoice's invoiceType.
  // Process in batches to avoid memory issues.
  const batchSize = 1000;
  let offset = 0;
  let totalUpdated = 0;

  while (true) {
    const misEntries = await prisma.misEntry.findMany({
      select: {
        id: true,
        invoiceId: true,
        invoiceType: true,
      },
      orderBy: { id: "asc" },
      skip: offset,
      take: batchSize,
    });

    if (misEntries.length === 0) break;

    console.log(`Processing batch at offset ${offset}...`);

    // Fetch parent invoices for this batch
    const invoiceIds = [...new Set(misEntries.map((m) => m.invoiceId))];
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      select: { id: true, invoiceType: true },
    });

    const invoiceTypeById = new Map(invoices.map((inv) => [inv.id, inv.invoiceType]));

    // Update each MisEntry to match its parent Invoice's invoiceType (idempotent)
    for (const misEntry of misEntries) {
      const parentInvoiceType = invoiceTypeById.get(misEntry.invoiceId);
      if (parentInvoiceType && misEntry.invoiceType !== parentInvoiceType) {
        await prisma.misEntry.update({
          where: { id: misEntry.id },
          data: { invoiceType: parentInvoiceType },
        });
        totalUpdated++;
      }
    }

    offset += batchSize;
  }

  console.log(`Backfill complete! Updated ${totalUpdated} MisEntry rows.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
