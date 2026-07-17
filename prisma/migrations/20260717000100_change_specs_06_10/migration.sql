-- Change specs 06-10: therapist gender-preference safeguard (specs 09) and
-- guardian signature capture for minors (spec 08 G).
--
-- All three columns are nullable with no backfill: existing patients simply
-- have no stated preference (no warning fires), existing staff have no gender
-- on file (no warning fires for them specifically), and existing consent
-- records keep whatever guardian detail they already had.

-- IF NOT EXISTS: the deployed database predates this repo's migration history
-- (it has no _prisma_migrations table — it was built with `prisma db push`), so
-- these columns may be applied directly rather than through `migrate deploy`.
-- Keeping the statements re-runnable means both paths converge safely.

ALTER TABLE "public"."Client"
  ADD COLUMN IF NOT EXISTS "preferredTherapistGender" TEXT;

ALTER TABLE "public"."Staff"
  ADD COLUMN IF NOT EXISTS "gender" TEXT;

ALTER TABLE "public"."IntakeForm"
  ADD COLUMN IF NOT EXISTS "guardianSignatureDataUrl" TEXT;
