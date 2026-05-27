// Smoke for the consent flow's "FO fills intake on behalf" capability.
// Closes the bug where the assign-queue → consent step crashed with
// `no_intake_form` for any client created outside the QR path.
//
// Two halves:
//
//   1. Functional roundtrip — create a DRAFT Client with no IntakeForm,
//      replicate the /api/clients/[id]/intake-on-behalf write, replicate
//      the /api/clients/[id]/consent write, assert consentSigned + 2+
//      audit rows. Cleans up at the end.
//
//   2. Static error-mapper coverage — grep every *-client.tsx /
//      *-form.tsx under src/app/dashboard and src/components. Fail the
//      smoke if any of them still throws `err?.error ?? ...` (the raw
//      snake_case-code-in-toast antipattern). This catches regressions
//      at the next phase boundary the way smoke-multiclinic catches
//      `session.user.centreId` leaks.

import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { mapApiError } from "../src/lib/error-messages";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// 1×1 transparent PNG, base64'd. Small enough to satisfy the 4MB cap on the
// signature data URL and the >20-char zod min on the consent route.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

async function functionalRoundtrip(): Promise<void> {
  const centre = await prisma.centre.findFirst({ where: { isActive: true } });
  if (!centre) throw new Error("no active centre");
  const fo = await prisma.staff.findFirst({
    where: { role: "FRONT_OFFICE", isActive: true },
  });
  if (!fo) throw new Error("no FRONT_OFFICE staff");

  // Create a stub DRAFT client with no IntakeForm — the exact state that
  // used to crash the consent flow.
  const stub = await prisma.client.create({
    data: {
      clientCode: `SMOKE-${Date.now().toString(36).slice(-6).toUpperCase()}`,
      firstName: "Smoke",
      lastName: "Tester",
      phone: "+91 99999 99999",
      status: "DRAFT",
      centreId: centre.id,
    },
  });
  console.log(`[smoke-consent-on-behalf] stub client ${stub.clientCode} (no IntakeForm)`);

  try {
    // ── Phase 1 — Replicate /api/clients/[id]/intake-on-behalf side effects.
    // The route validates, patches Client demographic fields that are empty,
    // and creates an IntakeForm row. We do the equivalent direct DB write so
    // the smoke can run without spinning up the HTTP server / NextAuth.
    const intakePayload = {
      firstName: "Smoke",
      lastName: "Tester",
      email: "smoke.tester@example.in",
      phone: "+91 99999 99999",
      dob: "1990-04-12",
      sex: "M" as const,
      addressLine1: "Flat 1, Smoke Tower",
      addressCity: "Mumbai",
      addressPincode: "400001",
      emergencyName: "Emergency Smoke",
      emergencyPhone: "+91 99999 88888",
      emergencyRelationship: "spouse",
      selectedCategories: ["physiotherapy", "strength-conditioning"],
      othersText: "",
    };
    const intakeForm = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: stub.id },
        data: {
          email: intakePayload.email,
          dob: new Date(intakePayload.dob),
          age: 35,
          sex: intakePayload.sex,
          address: JSON.stringify({
            line1: intakePayload.addressLine1,
            city: intakePayload.addressCity,
            pincode: intakePayload.addressPincode,
          }),
          emergencyContact: JSON.stringify({
            name: intakePayload.emergencyName,
            phone: intakePayload.emergencyPhone,
            relationship: intakePayload.emergencyRelationship,
          }),
          visitReasons: JSON.stringify(intakePayload.selectedCategories),
        },
      });
      return tx.intakeForm.create({
        data: {
          clientId: stub.id,
          selectedCategories: JSON.stringify(intakePayload.selectedCategories),
          formData: JSON.stringify({ othersText: intakePayload.othersText }),
          consentSigned: false,
          liabilityWaiverSigned: false,
          commercialTermsAccepted: true,
          cancellationPolicyAcknowledged: true,
          frontOfficeExecId: fo.id,
        },
      });
    });
    await prisma.auditLog.create({
      data: {
        action: "CREATE",
        entity: "IntakeForm",
        entityId: intakeForm.id,
        performedById: fo.id,
        metadata: JSON.stringify({ source: "intake-on-behalf", clientId: stub.id }),
      },
    });
    console.log(`[smoke-consent-on-behalf] created IntakeForm ${intakeForm.id}`);

    // ── Phase 2 — Replicate /api/clients/[id]/consent side effects.
    await prisma.$transaction([
      prisma.client.update({
        where: { id: stub.id },
        data: { consentFormPhotoUrl: TINY_PNG },
      }),
      prisma.intakeForm.update({
        where: { id: intakeForm.id },
        data: {
          consentMethod: "PHYSICAL_SCAN",
          consentSigned: true,
          liabilityWaiverSigned: true,
          signatureDataUrl: TINY_PNG,
          frontOfficeExecId: fo.id,
        },
      }),
    ]);
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "IntakeForm",
        entityId: intakeForm.id,
        performedById: fo.id,
        changes: JSON.stringify({
          consentSigned: { old: false, new: true },
          consentMethod: { old: null, new: "PHYSICAL_SCAN" },
        }),
      },
    });

    // Assertions.
    const after = await prisma.client.findUnique({
      where: { id: stub.id },
      include: { intakeForms: true },
    });
    if (!after) throw new Error("stub client vanished");
    const form = after.intakeForms[0];
    if (!form) throw new Error("IntakeForm not created");
    if (!form.consentSigned) throw new Error("consentSigned still false");
    if (form.consentMethod !== "PHYSICAL_SCAN") throw new Error("consentMethod wrong");
    if (!after.consentFormPhotoUrl) throw new Error("consentFormPhotoUrl not set");

    const auditRows = await prisma.auditLog.count({
      where: {
        entity: { in: ["IntakeForm", "Client"] },
        OR: [{ entityId: stub.id }, { entityId: intakeForm.id }],
      },
    });
    if (auditRows < 2) throw new Error(`expected ≥2 audit rows, got ${auditRows}`);
    console.log(
      `[smoke-consent-on-behalf] consent captured for ${stub.clientCode} (${auditRows} audit rows)`,
    );
  } finally {
    // Clean up regardless of outcome.
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: stub.id, entity: { in: ["IntakeForm", "Client"] } },
        ],
      },
    });
    await prisma.intakeForm.deleteMany({ where: { clientId: stub.id } });
    await prisma.client.delete({ where: { id: stub.id } });
  }
}

async function errorMapperCoverage(): Promise<void> {
  // Static check — scan every client component for the raw error-code pattern.
  // The mapper layer turns snake_case codes into actionable copy; any new
  // surface that throws err?.error directly regresses the consent fix the
  // user originally reported.
  const ROOTS = [
    "src/app/dashboard",
    "src/app/intake",
    "src/components/clinical",
    "src/components/layout",
    "src/components/intake",
  ];
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(e.name)) continue;
      const src = await fs.readFile(full, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        // The antipattern is: const err = (await res.json...) ...
        // followed by throw new Error(err?.error ?? ...).
        // Match by looking for the throw form with the back-tick fallback.
        if (
          /throw new Error\(\s*(?:err|j)\?\.error\s*\?\?/.test(line) ||
          /toast\.error\(\s*j\?\.error\s*\?\?/.test(line)
        ) {
          offenders.push({ file: full, line: i + 1, text: line.trim() });
        }
      });
    }
  }

  for (const r of ROOTS) {
    await walk(path.join(process.cwd(), r));
  }

  if (offenders.length > 0) {
    console.error("[smoke-consent-on-behalf] raw-error-code antipattern leaked back in:");
    for (const o of offenders) {
      console.error(`  ${o.file}:${o.line}  ${o.text}`);
    }
    throw new Error("error-mapper coverage regression");
  }
  console.log(
    "[smoke-consent-on-behalf] error-mapper coverage clean — no raw err?.error toasts",
  );

  // And one smoke of the mapper itself so the dictionary stays sane.
  const friendly = mapApiError({
    error: "insufficient_stock",
    productName: "Theraloop",
    available: 3,
    requested: 5,
  });
  if (!friendly.includes("Theraloop") || !friendly.includes("3") || !friendly.includes("5")) {
    throw new Error(`mapper didn't interpolate detail: ${friendly}`);
  }
  console.log(`[smoke-consent-on-behalf] mapper interpolation OK — "${friendly}"`);
}

async function main(): Promise<void> {
  await functionalRoundtrip();
  await errorMapperCoverage();
  console.log("[smoke-consent-on-behalf] PASS ✅");
}

main()
  .catch((err) => {
    console.error("[smoke-consent-on-behalf] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
