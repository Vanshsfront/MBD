// Idempotent production DB patch for the 2026-07-15 change-spec bundle.
//
// Use this when an existing Supabase database was created before Prisma
// migration history was adopted, so `prisma migrate deploy` refuses with P3005.
// It applies only the additive DDL from
// prisma/migrations/20260715000100_change_specs_bundle/migration.sql and
// upserts the active Terms of Service v1.0 legal document.

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_URL or DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const ddlStatements = [
  `ALTER TABLE "public"."Client" ADD COLUMN IF NOT EXISTS "title" TEXT`,
  `ALTER TABLE "public"."Client" ADD COLUMN IF NOT EXISTS "gstNumber" TEXT`,
  `ALTER TABLE "public"."IntakeForm" ADD COLUMN IF NOT EXISTS "termsOfServiceAgreed" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "public"."IntakeForm" ADD COLUMN IF NOT EXISTS "termsOfServiceVersion" TEXT`,
  `ALTER TABLE "public"."IntakeForm" ADD COLUMN IF NOT EXISTS "termsOfServiceAgreedAt" TIMESTAMP(3)`,
  `ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3)`,
  `ALTER TABLE "public"."Invoice" ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3)`,
  `ALTER TABLE "public"."MisEntry" ADD COLUMN IF NOT EXISTS "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "public"."MisEntry" ADD COLUMN IF NOT EXISTS "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `ALTER TABLE "public"."MisEntry" ADD COLUMN IF NOT EXISTS "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "public"."LegalDocument" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LegalDocument_key_version_key" ON "public"."LegalDocument"("key", "version")`,
  `CREATE INDEX IF NOT EXISTS "LegalDocument_key_isActive_idx" ON "public"."LegalDocument"("key", "isActive")`,
  `CREATE TABLE IF NOT EXISTS "public"."InvoiceCorrection" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "originalInvoiceId" TEXT NOT NULL,
    "correctionInvoiceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceCorrection_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceCorrection_correctionInvoiceId_key" ON "public"."InvoiceCorrection"("correctionInvoiceId")`,
  `CREATE INDEX IF NOT EXISTS "InvoiceCorrection_originalInvoiceId_idx" ON "public"."InvoiceCorrection"("originalInvoiceId")`,
  `CREATE INDEX IF NOT EXISTS "InvoiceCorrection_createdById_idx" ON "public"."InvoiceCorrection"("createdById")`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceCorrection_originalInvoiceId_fkey'
    ) THEN
      ALTER TABLE "public"."InvoiceCorrection"
        ADD CONSTRAINT "InvoiceCorrection_originalInvoiceId_fkey"
        FOREIGN KEY ("originalInvoiceId") REFERENCES "public"."Invoice"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceCorrection_correctionInvoiceId_fkey'
    ) THEN
      ALTER TABLE "public"."InvoiceCorrection"
        ADD CONSTRAINT "InvoiceCorrection_correctionInvoiceId_fkey"
        FOREIGN KEY ("correctionInvoiceId") REFERENCES "public"."Invoice"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceCorrection_createdById_fkey'
    ) THEN
      ALTER TABLE "public"."InvoiceCorrection"
        ADD CONSTRAINT "InvoiceCorrection_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END $$`,
  `UPDATE "public"."Invoice"
   SET "igstAmount" = "totalGst"
   WHERE "totalGst" <> 0
     AND "cgstAmount" = 0
     AND "sgstAmount" = 0
     AND "igstAmount" = 0`,
  `UPDATE "public"."MisEntry"
   SET "igstAmount" = "gst"
   WHERE "gst" <> 0
     AND "cgstAmount" = 0
     AND "sgstAmount" = 0
     AND "igstAmount" = 0`,
  `UPDATE "public"."Service"
   SET "isActive" = false
   WHERE "name" = 'Initial Consultation'
     AND "basePrice" = 500
     AND "departmentId" IN (
       SELECT "id" FROM "public"."Department" WHERE "name" = 'Medical'
     )`,
] as const;

async function main() {
  for (const statement of ddlStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  const bodyMarkdown = await fs.readFile(
    path.join(process.cwd(), "reference/legal/terms-of-service-v1.md"),
    "utf8",
  );

  await prisma.legalDocument.upsert({
    where: { key_version: { key: "TERMS_OF_SERVICE", version: "1.0" } },
    create: {
      key: "TERMS_OF_SERVICE",
      version: "1.0",
      effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      bodyMarkdown,
      isActive: true,
    },
    update: {
      effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      bodyMarkdown,
      isActive: true,
    },
  });

  const doc = await prisma.legalDocument.findFirst({
    where: { key: "TERMS_OF_SERVICE", isActive: true },
    select: { version: true, effectiveDate: true },
  });
  console.log(
    `[change-specs-db-patch] LegalDocument active ToS: v${doc?.version ?? "missing"} effective ${doc?.effectiveDate.toISOString() ?? "missing"}`,
  );
}

main()
  .catch((err) => {
    console.error("[change-specs-db-patch] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
