-- Change specs bundle: legal documents, patient billing metadata, GST split,
-- and immutable invoice correction trail.

ALTER TABLE "public"."Client"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "gstNumber" TEXT;

ALTER TABLE "public"."IntakeForm"
  ADD COLUMN "termsOfServiceAgreed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "termsOfServiceVersion" TEXT,
  ADD COLUMN "termsOfServiceAgreedAt" TIMESTAMP(3);

ALTER TABLE "public"."Invoice"
  ADD COLUMN "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "finalizedAt" TIMESTAMP(3);

ALTER TABLE "public"."MisEntry"
  ADD COLUMN "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Legacy invoices only stored combined GST. New invoices use state-based
-- split; preserve old totals by carrying them as IGST until corrected.
UPDATE "public"."Invoice"
SET "igstAmount" = "totalGst"
WHERE "totalGst" <> 0
  AND "cgstAmount" = 0
  AND "sgstAmount" = 0
  AND "igstAmount" = 0;

UPDATE "public"."MisEntry"
SET "igstAmount" = "gst"
WHERE "gst" <> 0
  AND "cgstAmount" = 0
  AND "sgstAmount" = 0
  AND "igstAmount" = 0;

CREATE TABLE "public"."LegalDocument" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalDocument_key_version_key" ON "public"."LegalDocument"("key", "version");
CREATE INDEX "LegalDocument_key_isActive_idx" ON "public"."LegalDocument"("key", "isActive");

CREATE TABLE "public"."InvoiceCorrection" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPLIED',
  "originalInvoiceId" TEXT NOT NULL,
  "correctionInvoiceId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceCorrection_correctionInvoiceId_key" ON "public"."InvoiceCorrection"("correctionInvoiceId");
CREATE INDEX "InvoiceCorrection_originalInvoiceId_idx" ON "public"."InvoiceCorrection"("originalInvoiceId");
CREATE INDEX "InvoiceCorrection_createdById_idx" ON "public"."InvoiceCorrection"("createdById");

ALTER TABLE "public"."InvoiceCorrection"
  ADD CONSTRAINT "InvoiceCorrection_originalInvoiceId_fkey"
  FOREIGN KEY ("originalInvoiceId") REFERENCES "public"."Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."InvoiceCorrection"
  ADD CONSTRAINT "InvoiceCorrection_correctionInvoiceId_fkey"
  FOREIGN KEY ("correctionInvoiceId") REFERENCES "public"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."InvoiceCorrection"
  ADD CONSTRAINT "InvoiceCorrection_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remove the fabricated service from future use in live databases without
-- breaking any historical JSON snapshots that might still mention its id.
UPDATE "public"."Service"
SET "isActive" = false
WHERE "name" = 'Initial Consultation'
  AND "basePrice" = 500
  AND "departmentId" IN (
    SELECT "id" FROM "public"."Department" WHERE "name" = 'Medical'
  );
