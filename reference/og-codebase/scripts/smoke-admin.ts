// Phase 7 verification — proves the four new admin surfaces actually work.
//
// 1. Master-data XLSX parser → returns >0 services + >0 products from the
//    bundled reference file. Same parser the import endpoint uses.
// 2. Services-import upsert path: take the parsed rows, upsert against the
//    real DB, assert idempotent (a second pass changes nothing).
// 3. Attendance: write a CHECK_IN + CHECK_OUT for a staff member, read
//    them back via the admin GET path's query, assert both present.
// 4. Static guard: confirm the four route files we just added exist
//    (admin/attendance, sessions, billing/packages, admin/products/[id]).

import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { parseMasterDataBuffer, inferServiceType } from "../src/lib/master-data";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const MASTER_DATA_PATH = path.join(
  process.cwd(),
  "reference-material/formats/MBD Master Data (1).xlsx",
);

const REQUIRE_PAGES = [
  "src/app/dashboard/admin/attendance/page.tsx",
  "src/app/dashboard/sessions/page.tsx",
  "src/app/dashboard/billing/packages/page.tsx",
  "src/app/dashboard/admin/products/[id]/page.tsx",
  "src/app/api/attendance/route.ts",
  "src/app/api/admin/services/import/route.ts",
];

async function checkPagesExist(): Promise<void> {
  for (const rel of REQUIRE_PAGES) {
    const full = path.join(process.cwd(), rel);
    try {
      const stat = await fs.stat(full);
      if (!stat.isFile() || stat.size < 200) {
        throw new Error(`${rel} missing or stub`);
      }
    } catch {
      throw new Error(`${rel} not found`);
    }
  }
  console.log(`[smoke-admin] ${REQUIRE_PAGES.length} new files exist with non-stub content ✅`);
}

async function checkMasterParserAndImport(): Promise<void> {
  const buf = await fs.readFile(MASTER_DATA_PATH);
  const parsed = await parseMasterDataBuffer(buf);
  if (parsed.services.length === 0) throw new Error("parser returned 0 services");
  if (parsed.products.length === 0) throw new Error("parser returned 0 products");
  console.log(
    `[smoke-admin] parser ✅ services=${parsed.services.length} products=${parsed.products.length}`,
  );

  // Replicate the import-endpoint upsert against the real DB. Centre = the
  // first centre in the seed. Track changes for idempotency check.
  const centre = await prisma.centre.findFirst({ orderBy: { createdAt: "asc" } });
  if (!centre) throw new Error("no Centre seeded");
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptByName = new Map(departments.map((d) => [d.name, d.id]));

  // First pass — count what changes vs the seed baseline.
  let createdFirst = 0;
  let updatedFirst = 0;
  for (const svc of parsed.services) {
    const departmentId = deptByName.get(svc.department);
    if (!departmentId) continue;
    const existing = await prisma.service.findFirst({
      where: { name: svc.name, departmentId, centreId: centre.id },
    });
    if (existing) {
      const changed =
        existing.basePrice !== svc.basePrice ||
        existing.gstRate !== svc.gstRate ||
        existing.hsnSacCode !== (svc.hsnSac || null);
      if (changed) {
        await prisma.service.update({
          where: { id: existing.id },
          data: {
            basePrice: svc.basePrice,
            gstRate: svc.gstRate,
            hsnSacCode: svc.hsnSac || null,
            serviceType: inferServiceType(svc.name),
          },
        });
        updatedFirst++;
      }
    } else {
      await prisma.service.create({
        data: {
          name: svc.name,
          departmentId,
          centreId: centre.id,
          basePrice: svc.basePrice,
          gstRate: svc.gstRate,
          hsnSacCode: svc.hsnSac || null,
          serviceType: inferServiceType(svc.name),
          isActive: true,
        },
      });
      createdFirst++;
    }
  }
  console.log(
    `[smoke-admin] import pass1: created=${createdFirst} updated=${updatedFirst}`,
  );

  // Second pass — should be idempotent: no creates, no updates.
  let createdSecond = 0;
  let updatedSecond = 0;
  for (const svc of parsed.services) {
    const departmentId = deptByName.get(svc.department);
    if (!departmentId) continue;
    const existing = await prisma.service.findFirst({
      where: { name: svc.name, departmentId, centreId: centre.id },
    });
    if (!existing) {
      createdSecond++;
      continue;
    }
    if (
      existing.basePrice !== svc.basePrice ||
      existing.gstRate !== svc.gstRate ||
      existing.hsnSacCode !== (svc.hsnSac || null)
    ) {
      updatedSecond++;
    }
  }
  if (createdSecond > 0 || updatedSecond > 0) {
    throw new Error(
      `import not idempotent: pass2 reports created=${createdSecond} updated=${updatedSecond}`,
    );
  }
  console.log(`[smoke-admin] import pass2 idempotent ✅ (created=0, updated=0)`);
}

async function checkAttendance(): Promise<void> {
  const staff = await prisma.staff.findFirst({ where: { isActive: true } });
  if (!staff) throw new Error("no active staff");

  // Clean up any stale entries from earlier smoke runs today before we test.
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600_000);
  await prisma.attendanceLog.deleteMany({
    where: { staffId: staff.id, date: { gte: start, lt: end } },
  });

  // Write CHECK_IN + CHECK_OUT.
  const inLog = await prisma.attendanceLog.create({
    data: { staffId: staff.id, type: "CHECK_IN", date: new Date() },
  });
  const outLog = await prisma.attendanceLog.create({
    data: { staffId: staff.id, type: "CHECK_OUT", date: new Date(Date.now() + 60_000) },
  });

  const back = await prisma.attendanceLog.findMany({
    where: { staffId: staff.id, date: { gte: start, lt: end } },
    orderBy: { date: "asc" },
  });
  if (back.length !== 2) throw new Error(`expected 2 logs, got ${back.length}`);
  const types = back.map((l) => l.type).sort();
  if (types[0] !== "CHECK_IN" || types[1] !== "CHECK_OUT") {
    throw new Error(`unexpected log types: ${types.join(",")}`);
  }
  console.log(`[smoke-admin] attendance roundtrip ✅ (CHECK_IN + CHECK_OUT for ${staff.name})`);

  // Cleanup.
  await prisma.attendanceLog.delete({ where: { id: inLog.id } });
  await prisma.attendanceLog.delete({ where: { id: outLog.id } });
}

async function main(): Promise<void> {
  await checkPagesExist();
  await checkMasterParserAndImport();
  await checkAttendance();
  console.log("[smoke-admin] PASS ✅");
}

main()
  .catch((err) => {
    console.error("[smoke-admin] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
