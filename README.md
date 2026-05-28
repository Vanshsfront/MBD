# Movement By Design — Clinic Operating System

Multi-modality wellness clinic OS for **Movement By Design** (MBD), Colaba,
Mumbai. Multi-clinic, role-aware, audit-logged. Built per
`/reference-material/PRD.md` (the source of truth — read it before changing
anything contentious).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Prisma 7 + Postgres
· NextAuth v5 · Tailwind v4 · FullCalendar · docxtemplater + exceljs ·
LibreOffice headless (DOCX→PDF) · node-cron.

> **Merged build.** This repo combines the proven OG backend/functionality with
> the Clinic 2 design language, adds an org-hierarchy view + full employee CRUD,
> richer per-role UX (multi-therapist assignment with a primary selector,
> reschedule validation, surfaced client flags, a Recent/All/Products invoice
> line picker), fixes the greeting + silent-redirect bugs, and applies baseline
> security hardening. Audit history, full handoff doc, and the Claude Design
> bundle now live in the sibling `../mbd-docs/` folder (out of the main repo).

## Run locally (Windows or *nix)

Requires **Node 20+** and **LibreOffice** (for DOCX→PDF). Database can be
either hosted **Supabase** (default) or local **Postgres in Docker** (fallback).

```bash
# 1. Install + generate
npm install
npx prisma generate

# 2. Dev server
npm run dev
# → http://localhost:3000   (login marazban@mbd.in / mbd2026 — see ../mbd-docs/HANDOFF.md)
```

### Database — Supabase (default) ↔ Docker (offline fallback)

`.env` points at Supabase (project `miaoxysgstytvnuvuvsw`, region `ap-southeast-1`).
For offline / network-free dev, swap to the Docker fallback:

```bash
cp .env.docker .env             # swap to local
docker start mbd-postgres       # start the container (was: docker run … postgres:16)
# … work offline …
cp .env.supabase .env           # swap back to Supabase when ready
```

If `.env.supabase` doesn't exist after a swap-back, the live config is the
`.env` shape — see `.env.local` for the Supabase publishable key + URL.

To reset the DB on first run / after a schema change:

```bash
npm run db:push
npm run db:seed
```

Seed: 1 Centre (`COL-MBD`), 7 Departments, ~45 Services, 13 Products, 22 Staff,
30 sample Clients, **plus a fully pre-completed Demo Patient** (`COL-MBD-DEMO`,
"Demo Patient — Walk-Through": intake + consent + 2 assignments + completed
physio consultation w/ recommendations + 8-session package + 3 sessions + paid
invoice + MIS row + VIP flag) so QA can verify every screen on login.

## Production-handoff gate

Cross-platform runner — 12 smoke scripts + `lint` + `build` (Windows-friendly
replacement for the legacy `run-all-smokes.sh`, which only exported `DATABASE_URL`):

```bash
node scripts/run-smokes.mjs            # full gate
node scripts/run-smokes.mjs --no-gate  # smokes only
```

Runs **11 smoke scripts + lint + build** in sequence; fails fast on first
red. Each smoke is idempotent (cleans up after itself). Use this as the
"is this ready to ship?" check.

| Smoke | Phase | What it proves |
|---|---|---|
| `smoke-prisma.ts` | 0 | Prisma + audit log roundtrip |
| `smoke-templates.ts` | 1 | XLSX invoice rendering + sample DOCX |
| `smoke-followups.ts` | 1 | 11 clinical templates render with sample data |
| `smoke-consent.ts` | 2 | COMMON\_PATIENT\_INTAKE\_FORM consent render |
| `smoke-clinical.ts` | 4 | Structured Physiotherapy Consultation roundtrip (84 leaf fields) |
| `smoke-change-requests.ts` | 3 | Auto-mutate Approve roundtrip (RESCHEDULE moves Appointment) |
| `smoke-billing.ts` | 5 | Manual + Products invoice + recommendations + inventory consume |
| `smoke-multiclinic.ts` | 6 | Static-grep guard + per-centre isolation |
| `smoke-admin.ts` | 7 | Services-import idempotency + attendance roundtrip |
| `smoke-portal.ts` | 8 | Public portal token gates + notification branching |
| `smoke-acceptance.ts` | 9 | Nav ⇔ canAccessRoute + PRD §4 journey contract |

## Repo map

```
prisma/
  schema.prisma           # PRD §5 schema
  seed.ts                 # idempotent seed (uses src/lib/master-data.ts)

reference-material/
  PRD.md                  # source of truth
  formats/                # client's actual DOCX/XLSX templates
  legacy-codebase/        # prior attempt — reference only

templates/                # client's templates with placeholders injected
  COMMON_PATIENT_INTAKE_FORM.docx
  PHYSICIAN_CONSULTATION.docx
  PHYSIOTHERAPY_CONSULTATION.docx
  *_FOLLOW_UP.docx        # 6 follow-ups
  WELLNESS_YOGA_INTAKE.docx        # built from scratch (PRD §6.1)
  COUNSELLING_INTAKE.docx          # built from scratch
  FAB.docx                         # built from scratch
  Invoice_*.xlsx                   # 4 invoice flavors

scripts/
  run-all-smokes.sh       # production-handoff gate
  inject-placeholders.ts  # adds {{placeholders}} to client DOCXs
  build-new-templates.ts  # generates the 3 from-scratch DOCXs
  smoke-*.ts              # 11 smoke scripts (table above)

src/
  app/                    # Next App Router routes
    portal/[token]/       # public read-only patient view (PRD §8)
    intake/[token]/       # public patient intake form
    dashboard/            # role-aware authenticated routes
    api/                  # API routes — see PRD §8
  lib/
    permissions.ts        # role × permission matrix (PRD §3.1)
    nav.ts                # role × route whitelist (source of truth for nav + RoleGuard)
    audit.ts              # createAuditLog + computeChanges (PRD §6.8)
    centre.ts             # activeCentreId() — cookie-aware multi-clinic helper
    discount.ts           # PRD §6.3 discount + promo stacking
    invoice-numbering.ts  # PRD §6.2 atomic per-centre per-FY numbering
    master-data.ts        # shared XLSX parser (used by seed + import endpoint)
    clinical-schemas.ts   # zod schemas per templateKey (Phase 4)
    templates/            # docxtemplater + exceljs wrappers
    cron/                 # node-cron jobs (package-expiry / low-stock / follow-up-due)
  components/
    clinical/             # 12 per-template clinical-record forms (Phase 4)
    layout/               # shell, search, notifications, centre switcher
    ui/                   # shadcn primitives
  generated/prisma/       # Prisma 7 client output
```

## Architectural conventions (read these before extending)

The revamp ships with a set of reusable patterns; follow them rather than
reinvent. Each one has a canonical smoke script.

| Concern | Canonical example | Memory ref |
|---|---|---|
| Review/approve flows | `/api/change-requests` PATCH | `reference_auto_mutate_review_pattern.md` |
| Clinical-record subsystem | `src/components/clinical/*` | `reference_clinical_pipeline.md` |
| Inventory mutations | `/api/inventory-usage` | `reference_inventory_mutation_pattern.md` |
| Cross-cutting concerns | `smoke-multiclinic.ts` | `reference_cross_cutting_smoke_pattern.md` |
| Bulk imports | `/api/admin/services/import` | `reference_bulk_import_pattern.md` |
| Public read-only views | `/portal/[token]` | `reference_token_auth_public_view.md` |
| DOCX rendering | `src/lib/templates/docx.ts` | `reference_docxtemplater_gotchas.md` |

## Common operations

### Add a new clinic

1. Owner → Admin → Clinics → "Add clinic" with name, slug, location, GST/PAN
   bank details. Optional "Copy from existing" duplicates services + inventory
   from the source centre. Staff are NOT copied (PRD §6.10).
2. Header centre switcher (Owner/Dev only) flips between centres.

### Refresh the service catalogue from XLSX

1. Owner → Admin → Services → "Import XLSX" with the latest MBD Master Data.
2. Per-row upsert keyed on `(name, departmentId, centreId)`. Re-running is
   idempotent — only changed prices update; audit log only on actual change.

### Invoice numbering

`{centreSlug}/{seq:0000}/{branchCounter:000}-{yyyy}` — e.g.
`COL-MBD/0001/426-2026`. Atomic per centre per FY via `InvoiceCounter`. PRD
§6.2.

### Add a new clinical template

Five steps:
1. `templates/<name>.docx` (or build from scratch with `docx` package).
2. Add a `DocxTemplateKey` in `src/lib/templates/keys.ts`.
3. zod schema in `src/lib/clinical-schemas.ts` + register in `CLINICAL_SCHEMAS`.
4. Per-template form component in `src/components/clinical/`.
5. Wire in `clinical-shell.tsx`'s `PerTemplateForm` switch + smoke-test.

### Add a new permission

1. Add to `PERMISSIONS` array in `src/lib/permissions.ts`.
2. Add to each role's grant list (`OWNER_PERMS`, `ADMIN_PERMS`, etc.).
3. If user-facing, add a `NavItem` in `src/lib/nav.ts` with `permission: "..."`.
4. Use via `requirePermission("...")` in API routes / `hasPermission(role, "...")`
   in pages.
5. Re-run `smoke-acceptance.ts` to confirm nav ⇔ permission alignment.

## What is NOT in scope (PRD §10)

- WhatsApp Business API automation
- Razorpay live payment integration
- HDFC POS integration
- DocuSign / legally-binding e-sign (digital pad image only)
- Salary / incentive auto-calc
- Email notifications
- AI receipt OCR

If any of these come back into scope, update PRD §10 first.

## Project context

- Single client: Movement By Design, Mumbai. Founder: Marazban Doctor (OWNER).
  Co-admin: Dr. Yasir Zahid (Head Physiotherapist).
- 21 staff, 7 clinical departments, 60-line service catalogue, 13 product SKUs.
- This is a rebuild — the prior attempt is in `/reference-material/legacy-codebase/`
  for reference. PRD wins where they disagree.

See `../mbd-docs/PROGRESS.md` for the phase-by-phase ledger of what shipped when.
