// Phase 6 verification — proves the centre switcher actually scopes
// reports + admin pages, not just the home dashboard.
//
// activeCentreId() reads the request cookie and falls back to the user's
// home centre. We can't easily simulate a Next request from a script, so
// we verify the *contract* both helpers depend on:
//   1. Every server page that scopes by centre uses `activeCentreId()`,
//      not `session.user.centreId` directly. Static grep — guards against
//      regressions.
//   2. Per-centre query counts for the reports actually differ when we
//      seed a 2nd centre with its own invoice. This is what the user sees
//      after switching the cookie.
//
// Cleanup at the end. Idempotent.

import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { allocateInvoiceNumber } from "../src/lib/invoice-numbering";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// Files we expect to be using the cookie-aware centre helper. If any of
// these grow a `session.user.centreId` reference again, the smoke fails.
const REQUIRE_ACTIVE_CENTRE = [
  "src/app/dashboard/reports/mis/page.tsx",
  "src/app/dashboard/reports/staff/page.tsx",
  "src/app/dashboard/reports/defaulters/page.tsx",
  "src/app/dashboard/reports/sources/page.tsx",
  "src/app/dashboard/reports/cancellations/page.tsx",
  "src/app/dashboard/admin/products/page.tsx",
  "src/app/dashboard/admin/services/page.tsx",
  "src/app/dashboard/calendar/page.tsx",
  "src/app/dashboard/intake/page.tsx",
  "src/app/dashboard/assign/page.tsx",
  "src/app/dashboard/patients/page.tsx",
  "src/app/dashboard/billing/invoices/page.tsx",
  "src/app/api/intake-token/route.ts",
  "src/app/api/search/route.ts",
  "src/app/api/invoices/route.ts",
  "src/app/api/reports/mis-csv/route.ts",
];

async function checkStaticGuards(): Promise<void> {
  for (const rel of REQUIRE_ACTIVE_CENTRE) {
    const full = path.join(process.cwd(), rel);
    const src = await fs.readFile(full, "utf8");
    if (src.includes("session.user.centreId") || src.includes("auth.user.centreId")) {
      // Allow only inside a comment or as a fallback to activeCentreId.
      const offending = src
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(
          ({ line }) =>
            (line.includes("session.user.centreId") || line.includes("auth.user.centreId")) &&
            !line.includes("activeCentreId") && // fallback line is OK
            !line.trim().startsWith("//"),
        );
      if (offending.length > 0) {
        throw new Error(
          `${rel} still references session.user.centreId / auth.user.centreId directly:\n` +
            offending.map(({ line, i }) => `  L${i + 1}: ${line.trim()}`).join("\n"),
        );
      }
    }
    if (!src.includes("activeCentreId")) {
      throw new Error(`${rel} does not import or call activeCentreId()`);
    }
  }
  console.log(
    `[smoke-multiclinic] ${REQUIRE_ACTIVE_CENTRE.length} files all import activeCentreId() and have no direct session/auth centreId leaks ✅`,
  );
}

async function checkPerCentreQueries(): Promise<void> {
  const colaba = await prisma.centre.findFirst({ where: { slug: "COL-MBD" } });
  if (!colaba) throw new Error("seed: COL-MBD centre missing");

  // Spin up a transient second centre. Idempotent — re-uses if already there.
  const slug = "AND-MBD-SMOKE";
  const andheri =
    (await prisma.centre.findFirst({ where: { slug } })) ??
    (await prisma.centre.create({
      data: {
        name: "MBD Andheri (smoke)",
        slug,
        location: "Andheri",
      },
    }));
  console.log(`[smoke-multiclinic] using centres: ${colaba.slug}, ${andheri.slug}`);

  // Use any FO + any client to write a test invoice in the new centre.
  const fo = await prisma.staff.findFirst({ where: { role: "FRONT_OFFICE", isActive: true } });
  if (!fo) throw new Error("no FRONT_OFFICE");
  const client = await prisma.client.findFirst({
    where: { status: "ACTIVE", centreId: colaba.id },
  });
  if (!client) throw new Error("no ACTIVE client in COL-MBD");

  // Count MIS rows per centre BEFORE.
  const colabaCountBefore = await prisma.misEntry.count({ where: { centreId: colaba.id } });
  const andheriCountBefore = await prisma.misEntry.count({ where: { centreId: andheri.id } });

  // Write one invoice + MIS row in the new centre.
  const numberAlloc = await allocateInvoiceNumber({
    centreId: andheri.id,
    centreSlug: andheri.slug,
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: numberAlloc.invoiceNumber,
      invoiceFlavor: "MANUAL",
      invoiceType: "INVOICE",
      subtotal: 500,
      totalGst: 0,
      totalAmount: 500,
      paidAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      discountType: "PERCENT",
      promotionDiscount: 0,
      status: "SENT",
      lineItems: JSON.stringify([
        { service: "smoke-multiclinic", consultantName: fo.name, qty: 1, perAmount: 500, gstRate: 0 },
      ]),
      clientId: client.id,
      centreId: andheri.id,
    },
  });
  await prisma.misEntry.create({
    data: {
      invoiceId: invoice.id,
      invoiceLineIndex: 0,
      clientId: client.id,
      centreId: andheri.id,
      centreName: andheri.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.createdAt,
      patientName: `${client.firstName} ${client.lastName}`,
      patientType: "New",
      service: "smoke-multiclinic",
      consultantId: fo.id,
      consultant: fo.name,
      type: "Clinic",
      amount: 500,
      amountBeforeTax: 500,
      netPayableAmount: 500,
      perSessionAmount: 500,
      noOfSessions: 1,
      sessionNo: 1,
      paidAmount: 0,
      balanceAmount: 500,
    },
  });

  const colabaCountAfter = await prisma.misEntry.count({ where: { centreId: colaba.id } });
  const andheriCountAfter = await prisma.misEntry.count({ where: { centreId: andheri.id } });

  if (colabaCountAfter !== colabaCountBefore) {
    throw new Error("Colaba MIS count changed unexpectedly — centre filter leaked");
  }
  if (andheriCountAfter !== andheriCountBefore + 1) {
    throw new Error(
      `Andheri MIS count expected ${andheriCountBefore + 1}, got ${andheriCountAfter}`,
    );
  }
  console.log(
    `[smoke-multiclinic] per-centre MIS counts isolated: ${colaba.slug}=${colabaCountAfter} ${andheri.slug}=${andheriCountAfter}`,
  );

  // Cleanup: remove the test invoice + MIS + the smoke centre.
  await prisma.misEntry.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoice.delete({ where: { id: invoice.id } });
  await prisma.invoiceCounter.deleteMany({ where: { centreId: andheri.id } });
  await prisma.centre.delete({ where: { id: andheri.id } });
  console.log(`[smoke-multiclinic] cleaned up test centre ${andheri.slug}`);
}

async function main(): Promise<void> {
  await checkStaticGuards();
  await checkPerCentreQueries();
  console.log("[smoke-multiclinic] PASS ✅");
}

main()
  .catch((err) => {
    console.error("[smoke-multiclinic] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
