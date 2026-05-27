# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Movement By Design (MBD)** — a physiotherapy/wellness clinic management system (Mumbai). Handles the full patient lifecycle: QR-scan intake → FO review → consent PDF → doctor assignment → consultation → packages/sessions → billing. ~21 staff across OWNER/ADMIN/MANAGER/FRONT_OFFICE/CONSULTANT/THERAPIST roles. Default staff emails follow `firstname@mbd.in`; default dev password is `mbd2026` (see `STAFF_CREDENTIALS.md`).

## Commands

```bash
npm run dev         # Next.js dev server (Turbopack)
npm run build       # Runs `prisma generate` then `next build`
npm run lint        # eslint (flat config in eslint.config.mjs)
npm run db:push     # Push schema changes to Postgres (no migrations)
npm run db:seed     # Run prisma/seed.ts (tsx)
npm run db:studio   # Prisma Studio
npm run db:reset    # Force-reset DB + reseed (destructive)
```

No test framework is configured. There are no migrations — schema is pushed directly with `prisma db push`, and seed data is synthetic (Indian names + mock clinical notes).

## Stack

- **Next.js 16** (App Router, React 19, Turbopack) + **TypeScript**
- **Prisma 6** against **Postgres** (Supabase in prod; `DATABASE_URL` + `DIRECT_URL` env vars)
- **NextAuth v5 (beta)** with Credentials provider, JWT sessions — see `src/lib/auth.ts`
- **Tailwind v4** + shadcn-style UI in `src/components/ui/` (Base UI primitives, `class-variance-authority`, `lucide-react`)
- **FullCalendar** for scheduling, **jsPDF** for consent/clinical/intake PDFs, **recharts** for reports
- **node-cron** for package-expiry job under `src/app/api/cron/`

## Architecture

### Data model (`prisma/schema.prisma`)

The schema models a clinic's full workflow; key relationships to know before editing:

- `Staff` has `role` (string, not enum) — OWNER | ADMIN | MANAGER | FRONT_OFFICE | CONSULTANT | THERAPIST. All access control flows from this field.
- `Client` is the patient. Lifecycle status: `DRAFT → ACTIVE → INACTIVE`. Linked to `IntakeForm`, `MedicalHistory`, `Consultation`, `Package`, `Session`, `Invoice`, `ClientDoctorAssignment`, `Appointment`, `ClientFlag`.
- **Patient intake is two-phase:** an `IntakeToken` is generated (QR-scanned by patient) → patient fills form at `/intake/[token]` → FO reviews and creates the actual `Client` record. `IntakeToken.status` goes PENDING → COMPLETED.
- `ClientDoctorAssignment` is the many-to-many join with history (`endedAt`, `replacedByAssignmentId`). Doctors/therapists see only their assigned clients.
- `Consultation` → creates `Package` (prepaid bundle of sessions) → `Session`s are consumed from the package → `Invoice` + `Payment`.
- Many fields that would be relations in a stricter schema are stored as **JSON strings** (e.g. `Client.address`, `IntakeForm.formData`, `Consultation.vitals`, `Session.allotments`, `Invoice.lineItems`). Parse defensively.
- `AuditLog` records CREATE/UPDATE/DELETE with a diff; `changes` and `metadata` are JSON strings.

### Access control (`src/lib/permissions.ts`)

The RBAC matrix in `ROLE_PERMISSIONS` is the source of truth. Use `hasPermission(role, "foo:bar")` / `canAccessModule(role, module)` rather than checking roles directly. The dashboard sidebar (`src/app/dashboard/layout.tsx`) also has a `ROLE_NAV_WHITELIST` that further restricts which pages a role sees even if a permission would grant access — keep these in sync when adding nav.

Role gotchas:
- `OWNER` is view-only for clinical notes (no `clinical_notes:edit_own`) but has `clinical_notes:super_view`.
- `THERAPIST`/`CONSULTANT` can only `change_requests:create` (reschedule/reassign proposals); FO/ADMIN/OWNER review them.
- `isClinicalRole` includes ADMIN and OWNER; `isManagementRole` includes MANAGER.

### Routing

- `src/app/login` — NextAuth credentials signin
- `src/app/dashboard/*` — authenticated staff UI, nav built from permission matrix
- `src/app/intake/[token]` — public patient-facing intake form (token-gated, no session)
- `src/app/portal/[token]` — public client portal share (via `DashboardShare` token)
- `src/app/api/*` — REST-style route handlers; each top-level dir roughly maps to a Prisma model
- `src/app/api/cron/package-expiry` — package expiry alert job (hit on a schedule)

### Conventions / things to know

- **Prisma client** is a singleton at `src/lib/prisma.ts` (guards against dev hot-reload leaks). Always `import { prisma } from "@/lib/prisma"`.
- **Auth in server code** — `import { auth } from "@/lib/auth"`. `session.user` is extended with `id`, `role`, `departmentId`, `departmentName`, `designation` (see `src/types/next-auth.d.ts`).
- **Audit logging** — use `createAuditLog({ action, entity, entityId, changes, metadata })` from `src/lib/audit.ts` on mutations. `computeChanges(old, new)` auto-diffs and skips `id`, `createdAt`, `updatedAt`, `passwordHash`. `performedById` resolves from the session automatically.
- **ID generation** — `generateClientCode()` produces `MBD-0001…`, `generateInvoiceNumber()` produces `MBD/001/2026`. Both in `src/lib/id-generator.ts`; they read the latest row, so concurrent inserts can collide (be aware for batch ops).
- **Client-side data fetching** uses the custom `useApiCache` hook in `src/hooks/use-api-cache.ts` — an in-memory cache with 5-minute TTL shared across the app. Call `invalidate()` / `refetch()` after mutations.
- **PDFs** — `src/lib/consent-pdf.ts`, `clinical-pdf.ts`, `intake-pdf.ts` build jsPDF documents; `csv-export.ts` handles report exports.
- **Validators** — Zod schemas in `src/lib/validators.ts` (plus the `VISIT_REASON_OPTIONS` / `SERVICE_CHOICE_OPTIONS` enums used in intake).
- **Two consultation templates** exist (Physician and Physiotherapy — the latter has full examination tables). Source `.docx` masters live at the repo root and in `reference-docs/`.
- **Path alias** — `@/*` → `src/*` (see `tsconfig.json`).

## Environment

Required env vars (`.env` / `.env.local`):
- `DATABASE_URL`, `DIRECT_URL` — Postgres (pooled + direct for Prisma migrations)
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (or `AUTH_SECRET` / `AUTH_URL` for NextAuth v5)
- Supabase keys if using `@supabase/supabase-js` client features

`prisma/dev.db` exists but the schema is Postgres-only — SQLite is not supported by the current `schema.prisma`.
