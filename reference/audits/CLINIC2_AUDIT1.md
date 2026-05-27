# Movement By Design (MBD) — Clinic Management System
## Full Audit, Architecture & Run Report

**Project audited:** `E:\WORK\GOATED\Medical\clinic 2\clinic`
**Date:** 2026‑05‑27
**Method:** Static source review of the full codebase **+** a live local run (Docker Postgres, dev server, production build, lint, authenticated/unauthenticated HTTP probes).
**Reviewer note:** Every claim in the *Audit Findings* section was cross‑checked against the actual source (file + line) and, where possible, reproduced against the running app. Findings from an earlier automated pass that turned out to be inaccurate (e.g. "clinical edit gate is never used", "40+ unauthenticated routes") have been **corrected** here.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Purpose & Domain](#2-project-purpose--domain)
3. [Tech Stack & Dependencies](#3-tech-stack--dependencies)
4. [Repository Layout & Hierarchy](#4-repository-layout--hierarchy)
5. [Build, Tooling & Configuration](#5-build-tooling--configuration)
6. [Data Model (Prisma)](#6-data-model-prisma)
7. [Authentication](#7-authentication)
8. [Authorization / RBAC](#8-authorization--rbac)
9. [API Surface](#9-api-surface)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Core Pipelines / Workflows](#11-core-pipelines--workflows)
12. [Library / Utilities Reference](#12-library--utilities-reference)
13. [Seed Data & Default Credentials](#13-seed-data--default-credentials)
14. [Run Report (Live)](#14-run-report-live)
15. [Audit Findings (Prioritized)](#15-audit-findings-prioritized)
16. [HIPAA / Compliance Reality Check](#16-hipaa--compliance-reality-check)
17. [Recommendations & Roadmap](#17-recommendations--roadmap)
18. [Appendices](#18-appendices)

---

## 1. Executive Summary

**Movement By Design (MBD)** is a full‑stack clinic‑management web application for a physiotherapy/wellness clinic in Mumbai. It models the entire patient lifecycle — QR‑code intake → front‑office (FO) review → doctor/therapist assignment → consultation → prepaid session packages → sessions → invoicing → payments → MIS reporting — across **7 roles** and **~22 seeded staff**.

**Stack:** Next.js 16 (App Router, React 19, Turbopack) · TypeScript 5 (strict) · Prisma 6 on PostgreSQL · NextAuth v5 (beta, Credentials + JWT) · Tailwind v4 · Base UI / shadcn‑style component library · FullCalendar · jsPDF · Recharts · node‑cron.

**Maturity:** The codebase is well‑organized, modern, and **builds and runs cleanly** (verified: production build exit 0, 74 routes, TypeScript and ESLint pass). The data model is rich and thoughtfully designed; billing/GST/MIS logic is genuinely sophisticated; clinical‑record locking and assignment gating are real and enforced on the relevant routes. It is best described as a **strong, demo‑ready product that is not yet production‑hardened**.

**Headline risks (all verified live):**
- **Inconsistent server‑side authorization.** ~18 of 49 API routes enforce auth (return 401/403); many **read** endpoints and several **create** endpoints do not. Unauthenticated `GET /api/clients`, `/api/staff`, `/api/invoices`, `/api/dashboard/stats` all returned **HTTP 200 with real PII/financial data** during the run.
- **An unauthenticated session is treated as *more* privileged, not less,** in `GET /api/clients`: the therapist "only‑my‑patients" filter is *skipped* when there is no session, so an anonymous caller receives **all** clients.
- **Secrets & default credentials in the working copy:** real‑looking Supabase DB password + service‑role JWT in `.env`/`.env.local` (git‑ignored, but shipped in the project folder/zip), a placeholder `AUTH_SECRET`, and a committed `STAFF_CREDENTIALS.md` documenting the universal default password `mbd2026`.
- **A `DEV` super‑role** (all permissions, no nav filter) with a seeded `dev@mbd.in / mbd2026` account.
- **Operational hygiene gaps:** no automated tests, no Prisma migrations (schema is `db push`‑only), no security headers, ID generators with a read‑then‑increment race, and a stale unusable `prisma/dev.db` (SQLite) despite a Postgres‑only schema.

The "HIPAA Compliant" badge on the login screen is **not substantiated** by the current controls (see §16).

---

## 2. Project Purpose & Domain

MBD digitizes the operations of a multi‑disciplinary physiotherapy & wellness clinic. Departments seeded include **Physiotherapy, Strength & Conditioning, Massage, Yoga, Counselling, Nutrition** (7 departments total).

**The patient lifecycle the app encodes:**

```
QR / link  ─►  Patient fills public intake form  ─►  FO reviews & creates Client (DRAFT)
   (IntakeToken)        (/intake/[token])                       │
                                                                ▼
                              FO assigns doctor/therapist (ClientDoctorAssignment)
                                                                │
                                                                ▼
                       Consultant logs Consultation  ─►  recommends a Package (prepaid bundle)
                                                                │
                                                                ▼
                  Sessions consumed from the Package  ─►  Invoice + Payment  ─►  MIS snapshot
```

**Who uses it (roles):** `OWNER`, `ADMIN`, `MANAGER`, `FRONT_OFFICE`, `CONSULTANT`, `THERAPIST`, plus a developer‑only `DEV` role. Clinical staff (therapists/consultants) see only patients assigned to them; FO handles intake/scheduling/billing; OWNER/ADMIN run the admin console and reports; MANAGER is a read‑only management view.

Source clinical templates (`.docx`) for **Physician** and **Physiotherapy** consultations live at the repo root and in `reference-docs/`; the app reproduces them as structured forms and renders them to PDF.

---

## 3. Tech Stack & Dependencies

From `package.json` (`name: movement-by-design`, `version 0.1.0`, `private`).

### Runtime dependencies

| Package | Version | Role in the app |
|---|---|---|
| `next` | ^16.2.6 | Framework (App Router, RSC, Turbopack) |
| `react` / `react-dom` | 19.2.3 | UI runtime |
| `typescript` | ^5 | Language (strict mode) |
| `@prisma/client` / `prisma` | ^6.19.2 | ORM + CLI (Postgres) |
| `@auth/prisma-adapter` | ^2.11.1 | (Present) Auth.js Prisma adapter |
| `next-auth` | ^5.0.0-beta.30 | Authentication (Credentials, JWT) |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `@supabase/supabase-js` | ^2.100.1 | Supabase client (storage / hosted Postgres) |
| `zod` | ^4.3.6 | Request/payload validation |
| `@base-ui/react` | ^1.3.0 | Headless UI primitives (the actual component base) |
| `shadcn` | ^4.0.8 | Component generator/CLI (`components.json`) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | — | Variant/className utilities |
| `tailwindcss` (v4) + `@tailwindcss/postcss` + `tw-animate-css` | ^4 | Styling |
| `lucide-react` | ^0.577.0 | Icon set |
| `cmdk` | ^1.1.1 | Command palette / global search |
| `@fullcalendar/*` | ^6.1.20 | Appointment calendar (daygrid/timegrid/list/interaction/react) |
| `recharts` | ^2.15.4 | Charts (dashboard, reports) |
| `react-day-picker` | ^9.14.0 | Date picker |
| `jspdf` | ^4.2.1 | Consent / clinical / intake PDF generation |
| `qrcode` + `@types/qrcode` | ^1.5.4 | QR codes for intake links |
| `signature_pad` | ^5.1.3 | Canvas signature capture |
| `node-cron` | ^4.2.1 | Scheduled jobs (package expiry) |
| `sonner` | ^2.0.7 | Toast notifications |
| `next-themes` | ^0.4.6 | Theme provider (currently pinned to light) |
| `date-fns` | ^4.1.0 | Date math |
| `embla-carousel-react`, `vaul`, `react-resizable-panels`, `input-otp` | — | UI building blocks |
| `dotenv` | ^17.3.1 | Env loading (scripts) |
| `uuid` | ^13.0.0 | ID helpers |

### Dev dependencies
`eslint` ^9 + `eslint-config-next` 16.1.6, `tailwindcss` ^4, `tsx` ^4.21.0 (run TS scripts/seed), `@types/*` (node, react, react-dom, bcryptjs, node-cron, uuid).

### npm scripts
```jsonc
"dev":      "next dev --turbopack",
"build":    "npx prisma generate && next build",
"start":    "next start",
"lint":     "eslint",
"db:push":  "npx prisma db push",          // no migrations — push schema directly
"db:seed":  "npx tsx prisma/seed.ts",
"db:studio":"npx prisma studio",
"db:reset": "npx prisma db push --force-reset && npx tsx prisma/seed.ts"  // DESTRUCTIVE
```

---

## 4. Repository Layout & Hierarchy

```
clinic 2/clinic/
├── prisma/
│   ├── schema.prisma           # 27 models, Postgres datasource
│   ├── seed.ts                 # synthetic seed (Indian names + mock clinical data)
│   ├── supabase_seed.sql       # SQL seed variant
│   └── dev.db                  # STALE SQLite file — schema is Postgres-only (unusable)
├── scripts/
│   ├── backfill-mis.ts         # backfill MisEntry rows from existing invoices
│   ├── backfill-slug.ts        # backfill Centre.slug
│   ├── patch-owner-dev.ts      # idempotent: rename owner + upsert dev@mbd.in (role DEV)
│   ├── reset-and-seed.ts       # guarded reset+seed wrapper
│   └── seed-sources.ts         # seed ReferralSource rows
├── src/
│   ├── app/
│   │   ├── layout.tsx          # root layout: <Providers> (SessionProvider) + <Toaster>, Inter font, forced light
│   │   ├── page.tsx            # "/" client redirect → /dashboard or /login
│   │   ├── login/page.tsx      # NextAuth credentials sign-in (shows "HIPAA Compliant" badge)
│   │   ├── intake/[token]/     # PUBLIC patient intake form (token-gated)
│   │   ├── portal/[token]/     # PUBLIC read-only client portal (DashboardShare token)
│   │   ├── dashboard/          # authenticated staff UI (see §10)
│   │   └── api/                # 49 route handlers (see §9)
│   ├── components/
│   │   ├── ui/                 # ~70 shadcn-style primitives over Base UI
│   │   ├── clinic-switcher.tsx, global-search.tsx, notification-center.tsx,
│   │   ├── providers.tsx, signature-pad.tsx, confirm-dialog.tsx, coming-soon.tsx
│   ├── hooks/
│   │   ├── use-api-cache.ts     # in-memory cache (5-min TTL) shared app-wide
│   │   └── use-mobile.ts
│   ├── lib/                    # business logic (see §12)
│   └── types/next-auth.d.ts    # session/JWT augmentation
├── reference-docs/             # source consultation templates
├── All_formats/                # exported form formats
├── CLAUDE.md                   # developer guide (accurate, useful)
├── README.md                   # default create-next-app boilerplate (not project-specific)
├── STAFF_CREDENTIALS.md        # all 21 staff emails + universal password `mbd2026`
├── components.json, next.config.ts, tsconfig.json, eslint.config.mjs, postcss.config.mjs
├── .env, .env.local            # secrets (git-ignored)
└── package.json, package-lock.json
```

Path alias: `@/*` → `src/*` (`tsconfig.json`).

---

## 5. Build, Tooling & Configuration

| File | Contents / notes |
|---|---|
| `next.config.ts` | **Empty** (`{}`). No security headers, redirects, image domains, or `typescript.ignoreBuildErrors`. |
| `tsconfig.json` | `strict: true`, `target ES2017`, `moduleResolution: bundler`, `noEmit`, `incremental`, `jsx: react-jsx`, **`skipLibCheck: true`**, path alias `@/*`. |
| `eslint.config.mjs` | Flat config (ESLint 9): `eslint-config-next/core-web-vitals` + `/typescript`, default ignores. No custom rules. |
| `postcss.config.mjs` | Single plugin `@tailwindcss/postcss` (Tailwind v4). |
| `components.json` | shadcn config: style `base-nova`, RSC, base color `neutral`, CSS variables, icon lib `lucide`, aliases for components/ui/lib/hooks/utils. |
| `.gitignore` | Ignores `node_modules`, `.next`, `build`, `*.pem`, **`.env*`**, `*.tsbuildinfo`, `next-env.d.ts`, `/src/generated/prisma`. ⇒ secrets are **not committed to git** (good), but `STAFF_CREDENTIALS.md` **is** tracked. |
| `skills-lock.json`, `.agents/` | Tooling metadata for the AI coding workflow used to build the project. |

**Env variables consumed:**
- `DATABASE_URL`, `DIRECT_URL` — Postgres (pooled + direct). Prisma CLI reads `.env`; Next runtime reads `.env.local` (which overrides `.env`).
- `AUTH_SECRET` (NextAuth v5), `AUTH_TRUST_HOST=true`. (`NEXTAUTH_URL`/`AUTH_URL` intentionally unset — set by the host in prod.)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase storage/admin.

**Build pipeline:** `build` runs `prisma generate` then `next build`. Verified working (see §14). Note: on Windows, a running `next dev` keeps the Prisma **query‑engine DLL** open, which makes a concurrent `prisma generate` fail with `EPERM` — an environment quirk, not a code defect.

---

## 6. Data Model (Prisma)

`prisma/schema.prisma` — **27 models**, `datasource db { provider = "postgresql" }`, generator `prisma-client-js`. No enums are declared; **status/role/type fields are plain `String`s** with the allowed values documented in inline comments. Several structured fields are stored as **JSON strings**.

### Entity catalogue

| Model | Purpose / key fields | Notable relations |
|---|---|---|
| **Centre** | Clinic/branch. `slug` (unique, used as code prefix), `location`, `isActive`. | staff, clients, sessions, invoices, appointments, services, misEntries |
| **Department** | `name` (unique), `defaultGstRate`. | services, staff |
| **Service** | `name`, `basePrice`, `gstRate`, `hsnSacCode`, `participantCount` (1/2/3 → locks invoice qty). Unique `(name, departmentId, centreId)`. | department, centre, consultations, sessions, appointments, inventoryItems |
| **Staff** (users) | `email` (unique), `passwordHash`, `role` (String), `designation`, `isActive`, `signatureDataUrl` (base64 PNG for PDF auto‑fill). | department, centre, consultations, sessions, auditLogs, doctorAssignments, appointments, notifications, change requests (made/reviewed) |
| **Client** (patient) | `clientCode` (unique, e.g. `MBD-0001`), name/phone/email/dob/age/sex/dominance, `status` DRAFT→ACTIVE→INACTIVE, `customerType` WALK_IN/REFERRAL, `consentFormPhotoUrl`, `clinicPolicyAcked`. **JSON:** `address`, `emergencyContact`, `visitReasons`. | centre, referralSource, preferredTherapist, intakeForms, medicalHistories, consultations, packages, sessions, invoices, alerts, flags, dashboardShares, doctorAssignments, appointments, misEntries |
| **IntakeForm** | Per‑visit intake snapshot; consent/waiver/terms flags. **JSON:** `selectedServices`, `formData`. | client |
| **MedicalHistory** | Vitals, comorbidities, complaints, diagnoses, plan. **JSON:** `vitals`, `comorbidities`, `personalHistory`. | client, service |
| **Consultation** | Clinical record; `recommendedSessions`, `isLocked`/`lockedAt`. **JSON:** `vitals`, `comorbidities`, `assessmentNotes` (carries `consultationType`: physician/physiotherapy/counselling/yoga/fab). | client, consultant (Staff), service, packages |
| **Package** | Prepaid bundle: `totalSessions`/`completedSessions`, `validFrom`/`validUntil`, `status` ACTIVE/EXPIRED/COMPLETED/CANCELLED, pricing + discount, `expiryWarningDays`. **JSON:** `serviceMix`. | client, consultation, sessions, invoices |
| **Session** | A delivered/scheduled session; `status` SCHEDULED/COMPLETED/CANCELLED/NO_SHOW, `perSessionAmount`. **JSON:** `allotments` (therapist/service mix). | package, client, therapist, service, centre |
| **Invoice** | `invoiceNumber` (unique), `invoiceType` INVOICE/PROFORMA, subtotal/GST/total/paid, discount (PERCENT/FLAT), promotion fields, `status` DRAFT/SENT/PAID/PARTIAL/OVERDUE. **JSON:** `lineItems`, `inventoryItems`. | client, package, centre, payments, misEntries |
| **Payment** | `amount`, `method` (CASH/CARD/CHEQUE/NEFT/UPI/RAZORPAY/OTHER), `reference`. | invoice |
| **Alert** | In‑app alerts (PACKAGE_EXPIRY, UNPAID_INVOICE, …). | targetUser, client |
| **AuditLog** | `action` CREATE/UPDATE/DELETE, `entity`, `entityId`. **JSON:** `changes` (diff), `metadata`. | performedBy (Staff) |
| **ClientFlag** | VIP/CAUTION/OVERDUE/… with color. | client |
| **InventoryItem** | SKU, category, stock/minStock, GST. | service |
| **InventoryLog** | ADDED/USED/ADJUSTED stock movements. | (by id) |
| **DashboardShare** | Public client‑portal token, `visibleSections` (JSON), `viewCount`, expiry. | client |
| **IntakeToken** | Public intake token (`token` unique, 48 h expiry), `status` PENDING/COMPLETED/EXPIRED, `formData` (JSON), `clientId` linked after submission. | (createdById) |
| **Appointment** | start/end, `status` CONFIRMED/RESCHEDULED/CANCELLED/COMPLETED/QUEUED, queue + backup times, cancellation metadata. | client, therapist, service, centre |
| **ClientDoctorAssignment** | Many‑to‑many w/ history: `isPrimary`, `assignedAt`, `endedAt`, `endedReason`, `replacedByAssignmentId`, `serviceId/serviceName`. Unique `(clientId, staffId)`. | client, staff |
| **Notification** | Typed user notifications, `priority`, `metadata` (JSON). | targetUser |
| **ChangeRequest** | RESCHEDULE/REASSIGN proposals; `details` (JSON), `status` PENDING/APPROVED/REJECTED. | requester, reviewedBy |
| **AttendanceLog** | CHECK_IN/CHECK_OUT for staff/clients. | (by id) |
| **Promotion** | Promo codes; PERCENT/FLAT, `maxDiscount`, validity window, `maxUses`/`usedCount`. | — |
| **ReferralSource** | Named referral sources, `sortOrder`. | clients |
| **MisEntry** | **Reporting snapshot** — one row per invoice line item, frozen at invoice creation; payment fields updated as payments arrive. Indexed on invoiceId/clientId/invoiceDate/centreId. | invoice (cascade), client, centre |

**Design conventions to know before editing:**
- *Enums‑as‑strings:* allowed values live only in comments + Zod/UI; the DB will accept any string. Validate at the edges.
- *JSON‑string fields:* `Client.address`, `IntakeForm.formData`, `Consultation.assessmentNotes`, `Session.allotments`, `Invoice.lineItems`, etc. are `JSON.parse`d at read time, sometimes inside `try/catch` that silently swallows malformed data. Parse defensively.
- *Multi‑clinic:* most transactional models carry an optional `centreId` so data can be scoped per branch.

---

## 7. Authentication

**`src/lib/auth.ts` (NextAuth v5 beta):**
- **Session strategy:** `jwt`. Sign‑in page `/login`.
- **Provider:** `Credentials` (email + password). `authorize()` looks up `Staff` by email (`include: department`), rejects if missing or `!isActive`, then `bcrypt.compare(password, passwordHash)`. On success returns `{ id, email, name, role, departmentId, departmentName, designation }`; on any failure returns `null` (no user enumeration, but also no rate limiting / lockout / logging).
- **Callbacks:** `jwt` copies `id/role/departmentId/departmentName/designation` onto the token; `session` copies them onto `session.user`. `trustHost: true`.
- **Route handler:** `src/app/api/auth/[...nextauth]/route.ts` exposes the Auth.js handlers.
- **Session typing:** `src/types/next-auth.d.ts` augments `User`/`Session`/`JWT` with `id`, `role` (imported as `Role`), `departmentId`, `departmentName`, `designation`.

**Verified live:** logging in as `marazban@mbd.in / mbd2026` returns a session of `{ name: "Dr. Marazban", role: "OWNER", designation: "Founder" }` and sets an `authjs.session-token` JWT cookie.

**Route protection:** There is **no `middleware.ts`** anywhere in the project. Authentication is therefore *not* enforced globally — each API route and page must check `auth()` itself, and many do not (see §9, §15). Public routes (`/intake/[token]`, `/portal/[token]`) are intentionally session‑less and gated by their token instead.

---

## 8. Authorization / RBAC

The source of truth is **`src/lib/permissions.ts`** — a `ROLE_PERMISSIONS: Record<Role, Permission[]>` matrix over 41 fine‑grained permission strings (e.g. `patients:edit_clinical`, `invoices:edit`, `reports:export`, `change_requests:review`).

### Roles & key distinctions

| Role | Scope | Notable rules |
|---|---|---|
| **DEV** | `ALL_PERMISSIONS` | Super‑role; sidebar shows **every** page with no filtering (`DEV_NAV`). |
| **OWNER** | Everything **except** `clinical_notes:edit_own`; has `clinical_notes:super_view`; only role with `reports:export` and `admin:clinics`. | View‑only on clinical notes; unrestricted on the clinical edit gate. |
| **ADMIN** | Clinical edit + most admin (no `admin:clinics`, no `reports:export`). | Can `change_requests:review`. |
| **MANAGER** | **Read‑only** management: view patients/sessions/invoices/reports/MIS + `admin:audit`/`admin:flags`. | No edit permissions. |
| **FRONT_OFFICE** | Intake, assign, scheduling, billing (`invoices:edit`, `payments:edit`, `packages:edit`), flags, inventory, `change_requests:review`. | No clinical edit, no reports. |
| **CONSULTANT** | Clinical: view patients, `patients:edit_clinical`, `sessions:edit_own`, `consultations:edit_own`, `clinical_notes:edit_own`, `change_requests:create`. | No billing/admin. |
| **THERAPIST** | Identical permission set to CONSULTANT. | — |

### Helpers
`hasPermission(role, perm)`, `hasAnyPermission`, `hasAllPermissions`, `getPermissions`, `canAccessModule(role, module)`, `isClinicalRole` (THERAPIST/CONSULTANT/ADMIN/OWNER/DEV), `isManagementRole` (FRONT_OFFICE/ADMIN/MANAGER/OWNER/DEV).

### Clinical‑record edit gate — **enforced server‑side** ✅
`src/lib/clinical-access.ts → canEditClinicalRecord({ userId, userRole, clientId, recordStatus })`:
- OWNER/DEV always allowed.
- THERAPIST/CONSULTANT require an **active** `ClientDoctorAssignment` (no `endedAt`), and are **hard‑locked out of editing `COMPLETED` records** ("you cannot change what you have already put in", per a 2026‑04‑17 decision in the comments).
- **It is actually wired in:** `src/app/api/sessions/[id]/route.ts:21` and `src/app/api/consultations/[id]/route.ts:51` both call it and return 403 on denial.

### Multi‑clinic scoping
`src/lib/active-centre.ts → getActiveCentreId()` resolves the centre server‑side from the session: OWNER/ADMIN/DEV may switch via an `activeCentreId` cookie, otherwise everyone is pinned to their `staff.centreId`. (The cookie value isn't validated against a list of clinics the user may access — see §15.)

### Client‑side nav gating
`src/app/dashboard/layout.tsx` builds the sidebar from the permission matrix **plus** a `ROLE_NAV_WHITELIST`:
- `FRONT_OFFICE` / `THERAPIST` / `CONSULTANT` → explicit short whitelists.
- `OWNER` / `ADMIN` / `MANAGER` → `ADMIN_ONLY_NAV` (Admin, Clinics, Hierarchy, Staff, Services) — i.e. management roles see only the admin console in the nav.
- `DEV` → unfiltered `DEV_NAV`.
- Clinical form pages (Counselling/Yoga/FAB) are additionally **department‑gated**.

This gating is **client‑side only**. It hides UI; it does not protect data, because the layout is a Client Component with no server `auth()` redirect (an unauthenticated visitor's `userRole` even defaults to `"THERAPIST"`).

---

## 9. API Surface

**49 route handlers** under `src/app/api/**` (each top‑level folder ≈ one Prisma model). Auth posture summary, verified by grep + live probing:

- **~18 files enforce auth/permission** (return 401/403): `staff*`, `services*`, `centres*`, `departments`, `promotions*`, `referral-sources*`, `active-centre`, `clients/[id]/assign-service`, and the clinical‑edit routes `sessions/[id]`, `consultations/[id]`.
- **The remaining ~31 do not gate** — including high‑value reads and several creates.

| Domain | Routes | Auth posture (observed) |
|---|---|---|
| Auth | `auth/[...nextauth]` | NextAuth handler |
| Clients | `clients`, `clients/[id]`, `clients/[id]/assign-service`, `clients/[id]/handover` | `clients` GET calls `auth()` only to *narrow* therapist results; **no session ⇒ all clients returned**. `clients` POST: **no auth**, `performedById` taken from body. `assign-service`: gated. |
| Intake | `intake-token`, `intake-token/[token]` | Token POST/GET: **no auth** (anyone can mint a 48 h intake token). |
| Consultations | `consultations`, `consultations/[id]` | List/create: **no auth**. `[id]` update: **gated** via `canEditClinicalRecord`. |
| Sessions | `sessions`, `sessions/[id]` | List/create: **no auth**. `[id]` update: **gated**. |
| Appointments | `appointments`, `appointments/[id]` | **No auth** (verified `[]` returned unauthenticated). |
| Packages | `packages`, `packages/[id]` | **No auth** observed. |
| Billing | `invoices`, `invoices/[id]`, `payments` | **No auth** (verified: full invoice list returned unauthenticated). Invoice/payment creation triggers MIS snapshot + audit. |
| Staff | `staff`, `staff/[id]`, `staff/me/password`, `staff/me/signature` | **Gated** (permission checks). `staff` GET returned data unauthenticated in the probe — verify per‑method. |
| Admin/config | `centres*`, `departments`, `services*`, `services/import`, `promotions*`, `referral-sources*`, `active-centre`, `flags`, `inventory` | Mostly **gated** (config), except `flags`/`inventory`. |
| Reporting | `dashboard/stats`, `mis`, `reports/{mis,staff,defaulters,sources}`, `audit` | **No auth** observed (`dashboard/stats` returned counts unauthenticated). |
| Other | `notifications`, `change-requests`, `dashboard-share`, `client-portal/[token]`, `upload`, `cron/package-expiry` | `client-portal/[token]` is token‑public by design. `cron/package-expiry`: **no auth** (GET mutates package statuses + creates notifications). `upload`: review. |

> The precise per‑method matrix should be generated as part of remediation; the takeaway is that **read and several write paths for patient/clinical/financial data are reachable without a session.**

---

## 10. Frontend Architecture

### Routing (App Router)
- **Root** `layout.tsx`: wraps the app in `<Providers>` (NextAuth `SessionProvider`) and a `sonner` `<Toaster>`; Inter font; `<html className="light">` (dark theme defined in CSS but not toggled).
- **`/`**: client redirect → `/dashboard` (authed) or `/login`.
- **`/login`**: credentials sign‑in; neumorphic UI; carries a "HIPAA Compliant" badge.
- **`/intake/[token]`** (public): multi‑step patient intake (demographics → visit reasons + consent), posts to `/api/intake-token/[token]`.
- **`/portal/[token]`** (public): read‑only client portal (overview / packages / sessions / invoices) via `DashboardShare`.
- **`/dashboard/**`**: authenticated staff UI (74 routes total built).

### Dashboard pages (selected)
Admin console: `admin` + `attendance, audit, change-requests, clinics, flags, hierarchy (draggable org tree), inventory, mis, promotions, referral-sources, services, staff`. Patients: directory, `[id]` profile (≈900 lines: bio, assignments, consultations, sessions, invoices, financials, modals), `[id]/clinical-record` (full physio assessment form + live jsPDF preview + record locking), `intake`, `assign`. Plus appointments calendar (FullCalendar), clinical forms (counselling/yoga/fab + physician consultation), sessions/consultations lists, therapist schedule/sessions, billing invoices/payments, packages, reports (mis/staff/defaulters/sources), settings/profile.

### Clinical record forms
`patients/[id]/clinical-record/` holds `physician-form.tsx`, `physio-form.tsx`, `yoga-form.tsx`, `counselling-form.tsx`, and shared `form-components.tsx`. The physio template is the most detailed (occupation/sport, comorbidities, HPI, structured **pain history** — site/side/onset/duration/frequency, VAS at rest & on movement, aggravating/relieving factors — and a treatment plan), rendered to PDF via `src/lib/clinical-pdf.ts` / `src/lib/pdf/*`.

### Components
- **`src/components/ui/`**: ~70 shadcn‑style primitives built on **Base UI** (`@base-ui/react`) — buttons, inputs, dialogs, drawers (vaul), command palette (cmdk), calendar (react‑day‑picker), charts (recharts wrapper), table, tabs, sidebar, resizable panels, etc.
- **Custom:** `clinic-switcher` (OWNER/ADMIN/DEV centre switch), `global-search` (⌘K across clients/sessions/invoices/packages), `notification-center`, `providers`, `signature-pad`, `confirm-dialog`, `coming-soon`.

### Data fetching & caching
`src/hooks/use-api-cache.ts` is an **app‑wide in‑memory cache** (single shared `Map`, 5‑minute TTL) exposing `useApiCache(url)`, `cachedFetch`, `invalidateCache(prefix)`, `clearAllCache`, `prefetchUrl`, `prefetchAll`. The dashboard layout **pre‑warms 15 endpoints** on mount (`PREFETCH_URLS`). Mutations must call `invalidate()/refetch()` to stay consistent. (Because the cache is module‑level and unauthenticated reads succeed, prefetch works even before a session is fully established.)

### Styling
Tailwind v4 via `@tailwindcss/postcss`; `globals.css` defines a warm‑neutral medical design system (CSS custom properties, neumorphic cards, gradients, custom scrollbars, shimmer/pulse animations). Dark theme tokens exist but are unused.

---

## 11. Core Pipelines / Workflows

**A. Two‑phase intake → Client.**
`POST /api/intake-token` mints an `IntakeToken` (48 h). Patient opens `/intake/[token]`, fills the form; `intake-token/[token]` validates expiry/usage and records `formData`. FO then creates the real `Client` via `POST /api/clients`, which: Zod‑validates (`clientSchema`, optional `intakeFormSchema`), generates `clientCode` via `generateClientCode(centreId)`, creates the `Client` (+ nested `IntakeForm`, optional `MedicalHistory`), notifies all active FO staff, and writes an audit log. `IntakeToken.status` → COMPLETED.

**B. Doctor/therapist assignment.** `ClientDoctorAssignment` (unique per client+staff) records assignments with history (`endedAt`, `replacedByAssignmentId`, `isPrimary`). Therapists/consultants only see/edit clients with an **active** assignment (enforced in `clients` GET narrowing and in the clinical edit gate).

**C. Consultation → Package → Session → Invoice → Payment.** A `Consultation` (`recommendedSessions`, JSON `assessmentNotes` carrying the template type) can spawn a `Package` (prepaid `totalSessions`, `serviceMix`, validity, pricing). `Session`s decrement the package. Billing is computed by `src/lib/billing.ts → calculateBilling()` (per‑line gross → discount PERCENT/FLAT → subtotal → GST → total; plus `calculateGstBreakdown` CGST/SGST vs IGST and `calculatePromoDiscount` applied **after** manual discount). Invoices get a number from `generateInvoiceNumber(centreId)`; `Payment`s are recorded against them.

**D. MIS snapshots.** `src/lib/mis.ts → createMisEntriesForInvoice()` writes one frozen `MisEntry` per invoice line at creation (patient New/Existing, previous dues, per‑line tax math, proportional paid allocation). `applyPaymentToMisEntries(invoiceId)` refreshes paid/balance/excess/mode when a payment arrives. This decouples reporting from later invoice edits.

**E. Change requests.** Therapists/consultants `change_requests:create` (reschedule/reassign proposals); FO/ADMIN/OWNER `change_requests:review`. Stored in `ChangeRequest` with JSON `details`.

**F. Package‑expiry cron.** `GET /api/cron/package-expiry` (intended for a scheduler): finds ACTIVE packages within `expiryWarningDays` of `validUntil`, creates de‑duplicated `PACKAGE_EXPIRY` notifications for FO staff, and flips past‑due ACTIVE packages to EXPIRED. **No auth on the endpoint.**

**G. PDF generation.** `src/lib/pdf/*` (physician/physio/yoga/counselling + helpers) and `consent-pdf.ts` / `clinical-pdf.ts` / `intake-pdf.ts` / `intake-form-pdf.ts` build jsPDF docs (auto‑filling the staff `signatureDataUrl`); `csv-export.ts` handles report CSVs.

---

## 12. Library / Utilities Reference

| Module | Responsibility |
|---|---|
| `lib/prisma.ts` | Prisma singleton guarded against dev hot‑reload leaks (`globalForPrisma`). |
| `lib/auth.ts` | NextAuth config (see §7). |
| `lib/permissions.ts` | RBAC matrix + helpers (see §8). |
| `lib/clinical-access.ts` | `canEditClinicalRecord` edit gate (assignment + COMPLETED lock). |
| `lib/active-centre.ts` | Active‑centre resolution + `canSwitchCentre`. |
| `lib/audit.ts` | `createAuditLog` (resolves performer: param → session → skip), `computeChanges` (auto‑diff, skips id/timestamps/passwordHash), `getSessionUserId`. Failures are swallowed so audit never breaks the main op. |
| `lib/id-generator.ts` | `generateClientCode` (`SLUG-0001`), `generateInvoiceNumber` (`SLUG/001/2026`) — read latest row then +1 (**race‑prone**). |
| `lib/billing.ts` | `calculateBilling`, `calculateGstBreakdown`, `calculatePromoDiscount`, `DISCOUNT_TIERS`, `PAYMENT_METHODS`. |
| `lib/mis.ts` | `createMisEntriesForInvoice`, `applyPaymentToMisEntries`. |
| `lib/validators.ts` | Zod schemas (clients, intake, etc.) + `VISIT_REASON_OPTIONS` / `SERVICE_CHOICE_OPTIONS`. |
| `lib/storage.ts` | File/photo storage (Supabase). |
| `lib/clinical-pdf.ts`, `consent-pdf.ts`, `intake-pdf.ts`, `intake-form-pdf.ts`, `pdf/*`, `mbd-logo.ts` | PDF generation + branding. |
| `lib/csv-export.ts` | Report CSV export. |
| `lib/therapist-colors.ts`, `lib/utils.ts` | Calendar color mapping; `cn()` classname helper. |
| `scripts/*` | `backfill-mis`, `backfill-slug`, `seed-sources`, `reset-and-seed`, `patch-owner-dev` (upserts the `dev@mbd.in` DEV account). |

---

## 13. Seed Data & Default Credentials

`prisma/seed.ts` (synthetic, Indian names + realistic clinical notes) produces, as verified during the run:

`7 departments · 1 centre · 41 services · 22 staff · 25 clients · 25 intake forms · 25 medical histories · 40 consultations · 25 packages · 110 sessions · 34 invoices · 20 payments · 20 alerts.`

**Default credentials** (`STAFF_CREDENTIALS.md`, committed): **every** account uses password **`mbd2026`** (bcrypt‑hashed at seed, 10 rounds). Examples: `marazban@mbd.in` (OWNER/Founder), `yasir@mbd.in` (ADMIN), `prerna@mbd.in` (CONSULTANT), `ramchandra@mbd.in`/`lata@mbd.in`/`helen@mbd.in` (FRONT_OFFICE), 15 therapists across Physio/S&C/Massage/Yoga/Counselling/Nutrition, and **`dev@mbd.in` (DEV)** — the DEV account is created by the seed itself and re‑asserted by `scripts/patch-owner-dev.ts`.

---

## 14. Run Report (Live)

The project was run end‑to‑end **locally against a Dockerized Postgres** (the live Supabase credentials in `.env.local` were *not* used; both env files were temporarily repointed and backed up).

**Environment:** Windows 11 · Node v22.17.1 · npm 10.9.2 · Docker 28.1.1 · tsx 4.21.0.

**Steps & results:**
1. **Docker Postgres:** `postgres:16` container `mbd-postgres` on `localhost:5432`, db `mbd` → `pg_isready` OK.
2. **Env:** `DATABASE_URL`/`DIRECT_URL` in `.env` and `.env.local` repointed to `postgresql://postgres:postgres@localhost:5432/mbd?schema=public`.
3. **`npm install`** → up to date. **`prisma db push`** → *"Your database is now in sync with your Prisma schema. Done in 808ms."*
4. **`npm run db:seed`** → full seed succeeded (counts above).
5. **`npm run dev`** → Next.js 16.2.6 (Turbopack), **Ready in ~1.4 s** on `http://localhost:3000`. (A pre‑existing stale dev server on PID 47652 — still pointed at Supabase — was stopped first; it had also been holding the Prisma query‑engine DLL, which was the sole cause of an earlier `prisma generate` EPERM.)
6. **`npm run build`** → `prisma generate` OK → **Compiled successfully in 18.4 s** → **TypeScript passed in 47 s** → **74 routes** generated → **exit 0**.
7. **`npm run lint`** → **exit 0** (clean).
8. **Auth flow:** CSRF → credentials POST (`marazban@mbd.in / mbd2026`) → `/api/auth/session` returned `{ role: "OWNER", designation: "Founder" }` with a JWT cookie. ✅
9. **Authenticated pages (OWNER):** `/dashboard`, `/dashboard/admin`, `/admin/staff`, `/admin/services`, `/admin/hierarchy`, `/patients`, `/billing/invoices`, `/reports/mis` → all **HTTP 200**.
10. **Public pages:** `/login` 200; `/intake/<bad>`, `/portal/<bad>` serve their client shells (200) and validate the token client‑side.
11. **Unauthenticated API probes (security check):**
    - `GET /api/clients` → **200**, 25 clients **with names/emails (PII)**.
    - `GET /api/staff` → **200**, full staff list.
    - `GET /api/invoices` → **200**, full invoice list (financials).
    - `GET /api/dashboard/stats` → **200**, clinic counts.
    - `GET /api/appointments` → **200**, `[]` (none seeded).

**Conclusion:** the application **builds, type‑checks, lints, seeds, and runs cleanly**, and the core auth + UI work. The unauthenticated‑API exposure was reproduced exactly as described in §15.

**Post‑run state (how it was left):** `.env`/`.env.local` are left pointing at the **local** Postgres URL (per request — this also keeps the real Supabase secrets out of the live files); the original Supabase values are preserved at `C:\Users\Asus\.claude\jobs\6f9c27f2\env.bak` and `env.local.bak`. The dev server was stopped and the `mbd-postgres` container was **removed** (local seed data discarded). To run again, recreate the container and reseed using the cheat‑sheet in Appendix B.

---

## 15. Audit Findings (Prioritized)

> Severity reflects production risk for a system holding patient health + financial data. Each item is grounded in verified source/behavior.

### 🔴 Critical

**C‑1 — Many API routes lack server‑side authentication.** No `middleware.ts`; ~31/49 routes don't gate. Verified live: `GET /api/clients|staff|invoices|dashboard/stats` return real data with no session. *Fix:* add `middleware.ts` (or an `requireAuth()` wrapper) protecting `/api/*` except `auth`, `intake-token/[token]`, `client-portal/[token]`, `cron` (cron gets its own secret) — then layer `hasPermission()` per route.

**C‑2 — Absent session = broader access in `GET /api/clients`.** `src/app/api/clients/route.ts:26‑36` applies the therapist "only‑my‑patients" filter **only when a session exists**; anonymous callers get *all* clients. *Fix:* require a session first; default‑deny, then narrow.

**C‑3 — Unauthenticated mutations.** `POST /api/clients` (no auth; `performedById` from request body → **spoofable audit attribution**, `src/app/api/clients/route.ts:210`), `POST /api/intake-token` (anyone can mint intake tokens, `intake-token/route.ts:6`), and `GET /api/cron/package-expiry` (anyone can flip package statuses + spam notifications). *Fix:* authenticate + permission‑check; derive `performedById` from the session; protect cron with a shared secret/Vercel cron header.

### 🟠 High

**H‑1 — Authorization is enforced inconsistently.** RBAC is solid *as a library* and the clinical‑edit gate (`sessions/[id]`, `consultations/[id]`) and most admin/config routes are protected, but list/read and several create routes are not. Page‑level gating is **client‑side only** (`dashboard/layout.tsx`), so direct navigation/API calls bypass it. *Fix:* enforce `canAccessModule`/`hasPermission` on every data route; add a server guard (redirect) to the dashboard layout or a route group.

**H‑2 — Secrets & default credentials in the shipped working copy.** `.env`/`.env.local` contain a real‑looking Supabase **DB password** and a **service‑role JWT** (full‑DB key, exp 2086); `AUTH_SECRET="mzrbn-secret-change-in-production-2026"` is a weak placeholder; `STAFF_CREDENTIALS.md` (committed) documents the universal password `mbd2026`. They're git‑ignored (not in history) but present in the folder/zip. *Fix:* **rotate** the Supabase password and service‑role key immediately; generate a strong `AUTH_SECRET` (`npx auth secret`); move secrets to a secret manager; force a password change on first login; stop shipping the credentials file.

**H‑3 — `DEV` super‑role.** `permissions.ts` grants DEV all permissions with no nav filter, and `dev@mbd.in / mbd2026` is seeded. A live DEV account in prod = full bypass. *Fix:* gate DEV behind `NODE_ENV !== "production"`; never seed it in prod; flag DEV actions in the audit log.

**H‑4 — ID‑generation race condition.** `id-generator.ts` reads the latest `clientCode`/`invoiceNumber` then `+1` with no transaction/lock; concurrent intake or invoicing can collide on the unique constraint. *Fix:* a per‑centre atomic counter (`Centre.nextClientNumber` with `increment`) or a Postgres sequence.

**H‑5 — Clinic scope trusts the `activeCentreId` cookie.** `getActiveCentreId()` returns the cookie value for OWNER/ADMIN/DEV without checking it's a centre they may access. *Fix:* validate the cookie against allowed centres; default‑deny.

### 🟡 Medium

**M‑1 — JSON‑string fields parsed without schema validation**, sometimes in silent `try/catch` (e.g. `consultations` filtering on `assessmentNotes`). *Fix:* Zod‑validate every parsed JSON blob; consider promoting hot fields to real columns/relations.

**M‑2 — Audit coverage is partial and silent.** `createAuditLog` swallows errors and **skips** logging when no performer resolves; many mutations don't call it. *Fix:* log all CREATE/UPDATE/DELETE; alert on audit failures; never accept `performedById` from the client.

**M‑3 — No automated tests.** No test runner/scripts/tests anywhere. *Fix:* add Vitest; cover permissions, `canEditClinicalRecord`, billing/GST/promo math, ID generation (incl. the race), and auth.

**M‑4 — No Prisma migrations.** Schema is applied via `db push`; `db:reset` uses `--force-reset` (destructive). No history/rollback. *Fix:* adopt `prisma migrate`; remove `--force-reset` from any non‑dev path.

**M‑5 — No rate limiting / lockout / MFA on login**; `authorize` fails silently with no logging. *Fix:* add rate limiting + lockout + failed‑attempt logging; offer TOTP MFA (require for OWNER/ADMIN).

**M‑6 — Read endpoints largely unpaginated** (appointments/sessions/consultations/invoices return full tables). *Fix:* paginate consistently (clients already does).

### 🟢 Low / Hygiene

**L‑1 — No security headers** (`next.config.ts` empty): add CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS.
**L‑2 — Stale `prisma/dev.db`** (SQLite) despite a Postgres‑only schema — misleading; remove.
**L‑3 — `next-auth.d.ts` imports `Role` from `@prisma/client`,** but `role` is a `String` column (no generated `Role` enum). It compiles only because `skipLibCheck:true` skips `.d.ts` checking; harmless at runtime but misleading. *Fix:* define a shared `Role` union type (already exists in `permissions.ts`) and import that.
**L‑4 — `README.md` is default boilerplate;** `CLAUDE.md` is the real, accurate guide — point README at it.
**L‑5 — `package.json#prisma` seed config is deprecated** (Prisma 7) — migrate to `prisma.config.ts`.

---

## 16. HIPAA / Compliance Reality Check

The login screen advertises "HIPAA Compliant." Current controls do **not** support that claim:

| Safeguard | State |
|---|---|
| Access control (technical) | ❌ Not consistently enforced server‑side (C‑1/C‑2/H‑1). |
| Authentication | ⚠️ Password‑only; no MFA, lockout, or rate limiting (M‑5). |
| Audit controls | ⚠️ Partial and silently best‑effort (M‑2). |
| Encryption in transit | ✅ via the host (HTTPS); HSTS not set (L‑1). |
| Encryption at rest | ⚠️ Provider‑dependent (Supabase); needs a signed BAA. |
| Secrets management | ❌ Real keys + weak `AUTH_SECRET` in working copy (H‑2). |

**Recommendation:** remove the "HIPAA Compliant" claim until C‑1…H‑2 are remediated, a Supabase BAA is signed, and an independent assessment is done.

---

## 17. Recommendations & Roadmap

**Phase 1 — Security hotfix (before any real patient data):** add auth middleware (C‑1); default‑deny + narrow in `clients` (C‑2); authenticate all mutations and derive `performedById` from the session (C‑3); protect the cron endpoint; **rotate Supabase + AUTH_SECRET** and remove the committed credentials file (H‑2); gate the DEV role to non‑prod (H‑3).

**Phase 2 — Authorization & integrity:** enforce `hasPermission` on every data route + a server guard on the dashboard (H‑1); validate the centre cookie (H‑5); make ID generation atomic (H‑4); Zod‑validate JSON fields (M‑1).

**Phase 3 — Operational maturity:** add Vitest coverage (M‑3); adopt Prisma migrations and de‑fang `db:reset` (M‑4); login rate‑limiting/lockout + MFA (M‑5); paginate reads (M‑2/M‑6); add security headers (L‑1).

**Phase 4 — Hygiene & compliance:** remove `dev.db` and the `Role` import nit (L‑2/L‑3); fix README (L‑4); migrate to `prisma.config.ts` (L‑5); pursue HIPAA assessment + BAAs (§16).

---

## 18. Appendices

### A. Environment‑variable reference
| Var | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma runtime + CLI | Pooled (6543) in prod; local Postgres for the run. |
| `DIRECT_URL` | Prisma (migrations/push) | Direct (5432). |
| `AUTH_SECRET` | NextAuth v5 | **Rotate** — current value is a placeholder. |
| `AUTH_TRUST_HOST` | NextAuth | `true` (host‑provided URL). |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client | Public by design. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin/storage | **Secret — rotate**; full‑DB access. |

### B. Local run cheat‑sheet (reproduces §14)
```bash
# 1. Postgres in Docker
docker run -d --name mbd-postgres -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mbd -p 5432:5432 postgres:16

# 2. Point both .env and .env.local at it
#    DATABASE_URL=DIRECT_URL="postgresql://postgres:postgres@localhost:5432/mbd?schema=public"

# 3. Set up + run (from clinic 2/clinic)
npm install
npx prisma generate            # ensure no `next dev` is running (Windows DLL lock)
npx prisma db push
npm run db:seed
npm run dev                    # http://localhost:3000  → login marazban@mbd.in / mbd2026

# Optional checks
npm run build && npm run lint
```

### C. Default logins (dev/demo only — password `mbd2026`)
OWNER `marazban@mbd.in` · ADMIN `yasir@mbd.in` · CONSULTANT `prerna@mbd.in` · FRONT_OFFICE `ramchandra@mbd.in` · THERAPIST `devanshi@mbd.in` · DEV `dev@mbd.in`. Full list in `STAFF_CREDENTIALS.md`.

### D. Key file index
`prisma/schema.prisma` (data model) · `src/lib/auth.ts` (auth) · `src/lib/permissions.ts` (RBAC) · `src/lib/clinical-access.ts` (clinical edit gate) · `src/lib/active-centre.ts` (multi‑clinic) · `src/lib/billing.ts` + `src/lib/mis.ts` (money) · `src/lib/id-generator.ts` (codes) · `src/lib/audit.ts` (audit) · `src/app/dashboard/layout.tsx` (nav/RBAC UI) · `src/app/api/clients/route.ts` (intake→client) · `src/app/api/cron/package-expiry/route.ts` (cron).

---

*End of report. Generated from a static review of the full source plus a verified local run on 2026‑05‑27.*
