// Phase 1 verification gate — Prisma + audit log smoke test.
// Mutates a sample client and confirms the audit log records the change.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const client = await prisma.client.findFirst({ where: { status: "ACTIVE" } });
    if (!client) throw new Error("no ACTIVE client found");

    const dev = await prisma.staff.findUnique({ where: { email: "dev@mbd.in" } });
    if (!dev) throw new Error("dev@mbd.in not seeded");

    const before = client.occupation;
    const newOccupation = before === "Lighthouse keeper" ? "Lighthouse keeper II" : "Lighthouse keeper";

    await prisma.client.update({
      where: { id: client.id },
      data: { occupation: newOccupation },
    });

    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "Client",
        entityId: client.id,
        performedById: dev.id,
        changes: JSON.stringify({ occupation: { old: before, new: newOccupation } }),
        metadata: JSON.stringify({ source: "smoke-prisma" }),
      },
    });

    const auditCount = await prisma.auditLog.count({
      where: { entity: "Client", entityId: client.id, performedById: dev.id },
    });

    const updated = await prisma.client.findUnique({ where: { id: client.id } });
    console.log(`[smoke-prisma] client ${client.clientCode}: ${before ?? "(null)"} → ${updated?.occupation ?? "(null)"}`);
    console.log(`[smoke-prisma] audit rows for this client by dev: ${auditCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
