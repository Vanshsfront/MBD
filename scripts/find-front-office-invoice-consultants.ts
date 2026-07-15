// Lists invoices whose frozen lineItems JSON names a FRONT_OFFICE staff member
// as consultant. This is intentionally read-only: existing issued invoices need
// manual accounting review before correction.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

interface LineItem {
  consultantId?: string | null;
  consultantName?: string | null;
  service?: string | null;
  product?: string | null;
}

async function main(): Promise<void> {
  const frontOffice = await prisma.staff.findMany({
    where: { role: "FRONT_OFFICE" },
    select: { id: true, name: true },
  });
  const foById = new Map(frontOffice.map((s) => [s.id, s.name]));
  if (foById.size === 0) {
    console.log("No FRONT_OFFICE staff found.");
    return;
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      OR: Array.from(foById.keys()).map((id) => ({ lineItems: { contains: id } })),
    },
    select: {
      id: true,
      invoiceNumber: true,
      createdAt: true,
      lineItems: true,
      client: { select: { firstName: true, lastName: true, clientCode: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  let affected = 0;
  for (const invoice of invoices) {
    const lines = parseLines(invoice.lineItems);
    const badLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.consultantId && foById.has(line.consultantId));
    if (badLines.length === 0) continue;
    affected++;
    console.log(
      [
        invoice.invoiceNumber,
        invoice.id,
        `${invoice.client.firstName} ${invoice.client.lastName} (${invoice.client.clientCode})`,
        invoice.createdAt.toISOString(),
      ].join(" | "),
    );
    for (const { line, index } of badLines) {
      console.log(
        `  line ${index + 1}: ${line.service ?? line.product ?? "—"} -> ${foById.get(line.consultantId!)}`,
      );
    }
  }

  console.log(`Affected invoices: ${affected}`);
}

function parseLines(json: string): LineItem[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as LineItem[]) : [];
  } catch {
    return [];
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
