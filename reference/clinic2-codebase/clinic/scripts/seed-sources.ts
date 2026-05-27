import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function run() {
  const defaults = [
    { name: "Walk-in", sortOrder: 1 },
    { name: "Doctor Referral", sortOrder: 2 },
    { name: "Patient Referral", sortOrder: 3 },
    { name: "Google / Online", sortOrder: 4 },
    { name: "Social Media", sortOrder: 5 },
    { name: "Insurance", sortOrder: 6 },
    { name: "Other", sortOrder: 99 },
  ];
  for (const d of defaults) {
    await prisma.referralSource.upsert({
      where: { name: d.name },
      create: d,
      update: {},
    });
  }
  console.log(`Seeded ${defaults.length} referral sources`);
  await prisma.$disconnect();
}
run().catch(console.error);
