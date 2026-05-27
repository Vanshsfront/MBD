/**
 * One-shot patch:
 *   - Rename marazban@mbd.in → "Dr. Marazban" (was "Marazban Doctor")
 *   - Make dev@mbd.in have role DEV with full-access designation.
 * Safe to re-run: idempotent updates only, never deletes.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

(async () => {
  const owner = await prisma.staff.update({
    where: { email: "marazban@mbd.in" },
    data: { name: "Dr. Marazban", designation: "Founder" },
  }).catch(() => null);
  console.log("owner:", owner ? `${owner.name} / ${owner.role}` : "not found");

  const passwordHash = await bcrypt.hash("mbd2026", 10);
  const dev = await prisma.staff.upsert({
    where: { email: "dev@mbd.in" },
    update: { name: "Developer", role: "DEV", designation: "Developer", isActive: true },
    create: {
      name: "Developer",
      email: "dev@mbd.in",
      passwordHash,
      role: "DEV",
      designation: "Developer",
      isActive: true,
    },
  });
  console.log("dev:  ", `${dev.name} / ${dev.role}`);

  await prisma.$disconnect();
})();
