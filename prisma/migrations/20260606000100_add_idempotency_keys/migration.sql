-- Add idempotency-key columns to Invoice and Payment.
-- Both nullable + unique. Legacy rows have NULL → no constraint conflicts.
-- A retried POST carrying the same Idempotency-Key header returns the
-- original row instead of creating a duplicate. Reference: audit-2026-06-06
-- F-008 (High).
--
-- NOTE: prisma migrate diff against the live DB at the time of the audit
-- surfaced unrelated schema drift (Session.* columns + RolePermission table).
-- That drift is NOT addressed by this migration — see prisma/migrations/README.md
-- for the reconciliation plan.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
