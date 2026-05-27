import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function run() {
  const centres = await prisma.centre.findMany();
  console.log("Centres found:", centres.length);
  for (const c of centres) {
    if (!c.slug) {
      await prisma.centre.update({ where: { id: c.id }, data: { slug: "MBD" } });
      console.log(`Backfilled slug MBD for centre: ${c.name}`);
    } else {
      console.log(`Centre ${c.name} has slug: ${c.slug}`);
    }
  }
  await prisma.$disconnect();
}
run().catch(console.error);
