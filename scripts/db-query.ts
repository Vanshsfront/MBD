import { prisma } from "../src/lib/prisma";

async function run() {
  const code = process.argv[2] || "COL-MBD-0034";
  console.log("Querying for client:", code);
  const client = await prisma.client.findFirst({
    where: { clientCode: code },
    include: {
      doctorAssignments: {
        include: {
          staff: true
        }
      },
      flags: true,
      intakeForms: true,
      appointments: {
        include: {
          service: true,
          therapist: true
        }
      }
    }
  });
  console.log("Client Record:", JSON.stringify(client, null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
