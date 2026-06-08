-- Add sessionVersion to Staff.
-- Bumped on logout / "sign out everywhere" / role change. JWTs carry the
-- version they were minted at; api-auth.ts rejects a JWT whose embedded
-- version is lower than the current row's. Reference: audit-2026-06-06 F-012.

ALTER TABLE "Staff" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
