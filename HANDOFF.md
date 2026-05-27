# MBD Clinic OS — Merged Build Handoff

Movement By Design clinic operating system. This build = the proven **OG**
backend/functionality, reskinned in the **Clinic 2** design language, with the
features/UX/bug-fixes/hardening listed below. Source-of-truth order:
**PRD > punchlist > audits > OG > Clinic 2**. Full forensic record + remaining
backlog: **`AUDIT_FINDINGS.md`**.

## Run it

See `README.md` → "Run locally". TL;DR: Postgres 16 (Docker), `.env` with
`DATABASE_URL`/`DIRECT_URL`/`AUTH_SECRET`/`SOFFICE_BIN`, then
`npm install && npx prisma generate && npm run db:push && npm run db:seed && npm run dev`.
Gate: `node scripts/run-smokes.mjs` (12 smokes + lint + build, ~95s).

## Credentials

All accounts: password **`mbd2026`**, email **`firstname@mbd.in`** (force a
change before production — see hardening backlog). One per role:

| Role | Login | Notes |
|---|---|---|
| OWNER | `marazban@mbd.in` | Everything; only role that can edit COMPLETED consultations; clinic CRUD; CSV export. |
| ADMIN | `yasir@mbd.in` | Mgmt + clinical view; no clinic CRUD / no payment recording. |
| FRONT_OFFICE | `ramchandra@mbd.in` (also `lata@`, `helen@`) | Intake, assignment, consent, calendar, billing, payments, inventory, flags. |
| CONSULTANT | `prerna@mbd.in` (Medical) | Own assignments only; clinical records + change requests. |
| THERAPIST | `devanshi@mbd.in` (Physio) | Own assignments only. Other clinical staff: `sanjay@`/`dipali@` (Massage), `naina@`/`shivli@` (Yoga), `disha@`/`shruti@` (Counselling), `sheetal@`/`rajal@` (Nutrition), `danesh@` (S&C). |
| DEV | `dev@mbd.in` | All permissions — **dev/test only; not seeded when `NODE_ENV=production`.** |

## Demo patient walkthrough (instant QA)

Seed creates **`COL-MBD-DEMO` — "Demo Patient — Walk-Through"** (find via the
patients list or Cmd-K "Demo"). It exercises the full happy path:

1. **Patients → Demo Patient** — header shows the **VIP "Long-time client"** flag (color-coded).
2. **Clinical record** (as `devanshi@mbd.in`, the primary physio) — a COMPLETED physiotherapy consultation with vitals, diagnosis, plan, and **8 recommended sessions**; "PDF" link renders the filled DOCX→PDF via LibreOffice.
3. **Packages** — an 8-session physio package, 3/8 completed, progress + linked sessions.
4. **Invoices** — a PAID Services invoice (`COL-MBD/0099/099-2026`) + a UPI payment; an MIS row.
5. **Billing → New invoice** for this patient — the **Recent** tab is pre-populated with the physio service (punchlist #5).
6. Two assignments (Physio primary + Massage) — visible on the assignment queue / patient detail.

## What changed in this merged build (phases A–H)

- **A — Foundation:** OG copied to repo root, stood up + verified on Windows (Docker Postgres, LibreOffice on E:), all 12 smokes + lint + build green; `scripts/run-smokes.mjs` cross-platform gate added. (`AUDIT_FINDINGS.md`)
- **B — Design system:** OG already matched Clinic 2's neumorphic palette; enriched `globals.css` (chart/sidebar tokens + stat-pill/hover-lift/shimmer/scrollbar + `tw-animate-css`), added 13 Radix UI primitives (dialog/select/tabs/dropdown/tooltip/checkbox/radio/switch/avatar/popover/table/textarea/progress), sidebar nav icons. No risky Base-UI migration.
- **C — Org-hierarchy + employee CRUD:** new `/dashboard/admin/hierarchy` org chart; `/api/admin/staff` gained create/full-edit/soft-delete (was activate/deactivate-only); shared Add/Edit dialogs; audited + RBAC-gated.
- **D — Per-role UX:** assignment **primary-therapist selector** (★); reschedule validation (future slot, working hours, therapist-active, clash, ±15min warning) with specific errors; **color-coded client-flag badges** on list + detail; **Recent/All/Products invoice line picker** + search + recents API.
- **E — Clinical forms:** verified full digital capture + correct dept→form routing; closed two PDF-fidelity gaps (physio consultant signature, physician plan-of-care) via a guarded `scripts/inject-supplemental.ts`.
- **F — Bug fixes:** greeting honorific bug ("Welcome, Dr." → "Welcome, Devanshi"); silent redirect → **"Access blocked" card** (reassigned-away still reaches view-only).
- **G — Hardening:** security headers; DEV gated out of prod seed; audit coverage confirmed across 25 routes.
- **H — Demo patient + docs + final gate.**

## Out of scope (PRD §10 — Phase 2, intentionally not built)

Razorpay live integration (manual UPI/cash/etc. flows exist; `RAZORPAY` is a payment method), WhatsApp/SMS/email (in-app notifications only), DocuSign / legally-binding e-sign (signature pad + scan upload exist; disclaimer shown), salary auto-calculation, AI receipt OCR.

## Known limitations / recommended hardening (see AUDIT_FINDINGS.md)

- **PDF fidelity backlog:** physician lab/imaging/referral/wellness checkboxes, physio provisional-diagnosis, and consultant signature on the 6 follow-ups are captured digitally but not yet printed; close via the guarded supplemental injector against the client's authoritative source DOCXs.
- **`nextClientCode` race** (`count()+1`) — replace with a per-centre atomic counter before high-concurrency use.
- **Force password change on first login**, **MFA + login rate-limiting/lockout**, **Prisma migrations** (currently `db push`), **strict CSP** (needs proxy nonce), **Vitest** unit tests — recommended for production.
- Lint: 0 errors, ~13 cosmetic warnings (`<img>` for base64 signatures, a few unused vars / orphan eslint-disable).

## Deploying to a VPS

Node 20 + PostgreSQL 16 + LibreOffice on the box. Set `DATABASE_URL`/`DIRECT_URL`
(co-located: `localhost:5432`), a strong `AUTH_SECRET` (`npx auth secret`),
`SOFFICE_BIN` (e.g. `/usr/bin/soffice`), `UPLOAD_DIR`, and `NODE_ENV=production`
(omits the DEV account). `npm ci && npm run build && npm run db:push && npm run db:seed && npm start`,
behind nginx/Caddy with Let's Encrypt (HSTS is already sent). Add the strict CSP
at the proxy. `DISABLE_CRON`/`MBD_DISABLE_CRON` controls the daily jobs.
