# Credentials reference

No actual secrets here — only the structure and where each thing lives in the repo.

---

## Staff logins (seeded)

All accounts share **password `mbd2026`** (defined once at `prisma/seed.ts:27`, hashed with bcryptjs cost 12 — see `BCRYPT_COST` in `src/lib/auth.ts`). Email format: `firstname@mbd.in` (lower-cased server-side in `src/lib/auth.ts:67`).

| Role | Email | Department | Notes |
|---|---|---|---|
| OWNER | `marazban@mbd.in` | — | Everything; only role that can edit COMPLETED consultations; clinic CRUD; CSV export |
| ADMIN | `yasir@mbd.in` | Physiotherapy | Management + clinical view; no clinic CRUD / no payment recording |
| CONSULTANT | `prerna@mbd.in` | Medical | Own assignments only |
| CONSULTANT | `danesh@mbd.in` | S&C | — |
| CONSULTANT | `disha@mbd.in` | Counselling | — |
| CONSULTANT | `shruti@mbd.in` | Counselling | — |
| CONSULTANT | `sheetal@mbd.in` | Nutrition | — |
| CONSULTANT | `rajal@mbd.in` | Nutrition | — |
| FRONT_OFFICE | `ramchandra@mbd.in`, `lata@mbd.in`, `helen@mbd.in` | — | Intake, assignment, consent, calendar, billing, payments, inventory, flags |
| THERAPIST (Physio) | `devanshi@mbd.in` | Physiotherapy | **Primary therapist on the Demo Patient — use for Journey B walks** |
| THERAPIST (Physio) | `aanchal@`, `tasneem@`, `deepa@`, `sanya@` | Physiotherapy | — |
| THERAPIST (Massage) | `sanjay@`, `dipali@`, `harshali@` | Massage | (Massage has no clinical record per PRD) |
| THERAPIST (Yoga) | `naina@`, `shivli@` | Yoga | — |
| DEV | `dev@mbd.in` | — | All permissions — **dev/test only; not seeded when `NODE_ENV=production`** |

Force-change-on-first-login is on the hardening backlog (`D7`). Until then, rotate `mbd2026` before any production exposure.

---

## Auto-generated business IDs

You don't pick these — they appear on screen:

| ID type | Format | Allocator | Schema |
|---|---|---|---|
| **Client code** (`Client.clientCode`) | `COL-MBD-0001` | `src/lib/client-codes.ts` (atomic via `ClientCodeCounter`) | `prisma/schema.prisma:208` |
| **Invoice number** (`Invoice.invoiceNumber`) | `COL-MBD/0001/426-2026` | `src/lib/invoice-numbering.ts` (atomic per-FY + per-month) | `prisma/schema.prisma:438` |

The Demo Patient is `COL-MBD-DEMO` (find via patients list or Cmd-K). Demo invoice: `COL-MBD/0099/099-2026` (PAID, UPI method).

---

## Public token URLs (not staff credentials)

| Surface | URL | Lifetime | Storage |
|---|---|---|---|
| Patient intake (QR) | `/intake/[token]` | 60 min, single-use | `IntakeToken.token` |
| Patient portal (read-only) | `/portal/[token]` | 30 days | `ClientPortalToken.token` |

Anyone with the URL can use it within its window — treat them like one-time links, not passwords.

---

## Environment variables (live in `.env`, not in the repo)

`.env` is gitignored. Shape lives in `handoff/reproduce/env-template`. Required keys:

| Variable | What it is | How to generate |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Use the Docker default: `postgresql://postgres:postgres@localhost:5432/mbd?schema=public` |
| `DIRECT_URL` | Same as above (no pooler) | Same value as `DATABASE_URL` |
| `AUTH_SECRET` | NextAuth JWT signing key | `npx auth secret` |
| `SOFFICE_BIN` | LibreOffice binary path for DOCX → PDF | OS-dependent; check `which soffice` (macOS/Linux) or installer path (Windows) |
| `UPLOAD_DIR` | Local disk for consent photos / signatures | Default `./uploads/`; pick an absolute path in prod |
| `NEXT_PUBLIC_SHOW_SEED_HINT` | `true` shows the `mbd2026` hint on `/login` | Leave blank in prod |
| `DISABLE_CRON` / `MBD_DISABLE_CRON` | `true` to skip node-cron registration | Useful in dev; leave blank in prod |

---

## Quick "find me the file" map

| You want… | Open this |
|---|---|
| The shared staff password | `prisma/seed.ts:27` |
| The full staff roster (emails, roles, depts) | `prisma/seed.ts:29-58` |
| A nicely-rendered role table | `HANDOFF.md` §"Credentials" |
| Demo patient walkthrough | `HANDOFF.md` §"Demo patient walkthrough" |
| Client-code format and counter | `prisma/schema.prisma:208` + `src/lib/client-codes.ts` |
| Invoice number format and counter | `prisma/schema.prisma:438` + `src/lib/invoice-numbering.ts` |
| Env var shape | `handoff/reproduce/env-template` |
| bcrypt cost (`BCRYPT_COST`) | `src/lib/auth.ts` |
