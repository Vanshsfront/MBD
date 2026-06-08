# Prisma migrations

## Layout

- `20260606000000_baseline/migration.sql` — captures the schema **as it
  existed in the live database at the time of the audit pass**. Generated
  via `prisma migrate diff --from-empty --to-config-datasource ...`. This
  migration is **not** intended to be re-applied to a database that
  already has these tables — it exists so that a fresh environment can
  be initialised from scratch.

- `20260606000100_add_idempotency_keys/migration.sql` — adds nullable
  `idempotencyKey TEXT @unique` to `Invoice` and `Payment`. Forward-
  compatible: legacy rows remain valid (NULL ignores the unique index).
  Reference: `review/audit-2026-06-06.md` F-008.

## How to bootstrap on the existing database (the one in use today)

1. **Snapshot first.**
   ```bash
   pg_dump -h localhost -U postgres -d mbd > backups/pre-migrate-$(date -I).sql
   ```

2. **Tell Prisma the baseline is already applied** (skip executing the
   `CREATE TABLE`s — the tables exist).
   ```bash
   npx prisma migrate resolve --applied 20260606000000_baseline
   ```

3. **Run the delta migration.** This is the only SQL that actually
   touches the database.
   ```bash
   npx prisma migrate deploy
   ```

   Expected effect: two `ALTER TABLE ADD COLUMN` + two `CREATE UNIQUE
   INDEX` statements. The columns are nullable, so no data backfill is
   required.

4. **Verify.**
   ```bash
   psql -h localhost -U postgres -d mbd -c "\\d \"Invoice\"" | grep idempotency
   psql -h localhost -U postgres -d mbd -c "\\d \"Payment\"" | grep idempotency
   ```

## Detected schema drift (noted but NOT migrated here)

Running `prisma migrate diff` between the current `schema.prisma` and the
current database surfaced changes that pre-date this audit batch:

- `Session.appointmentId`, `Session.consultationId`, `Session.endedAt`,
  `Session.recordedDurationMin`, `Session.sessionFormType`,
  `Session.startedAt` — columns present in the DB but absent from the
  current schema.
- `RolePermission` table present in the DB but absent from the schema.

These are **not** addressed by this migration. They indicate that an
earlier `db push` was applied while the schema and the database were
moving in different directions. They should be reconciled in a separate
PR — either by aligning the schema back to the DB or by writing a
deliberate migration that drops the columns/table.

Going forward, **never run `db push` against the production DB.** Use
`npm run db:migrate:new` to generate a migration file, review the SQL,
then `npm run db:migrate` to apply.
