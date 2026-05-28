# Phase A — OG Stand-up & Verification Findings

**Date:** 2026-05-27 · **Machine:** Windows 11 · Node v22.17.1 · Docker 28.1.1 · Postgres 16 (Docker `mbd-postgres:5432`) · LibreOffice at `E:/Program Files/LibreOffice/program/soffice.exe`

This documents what was verified standing OG up at the repo root, and the scope it confirms for Phases B–H. **Decision: proceed with reskin-on-OG (approach #1).** OG is a complete, tested system; we extend/reskin it rather than rebuild.

## Verification results — all green ✅

| Step | Result |
|---|---|
| `npm install` | 710 packages, exit 0 (11 transitive vulns — see Notes) |
| `prisma generate` (7.8.0) | OK |
| `prisma db push` | 29 tables in `mbd` |
| `prisma db seed` | 1 centre, 7 depts, 22 staff, 45 services, 13 products, 30 clients, 100 appts, 50 sessions, 30 MIS, 5 audit |
| **12 smoke scripts** (`node scripts/run-smokes.mjs --no-gate`) | **all PASS in 49s** incl. LibreOffice DOCX→PDF on Windows (clinical PDF 239KB; 4 invoice XLSX flavors incl. Proforma), billing/MIS, change-request auto-mutate, multi-clinic isolation, services-import idempotency, portal gating, nav↔permission acceptance (25 routes × 6 roles) |
| `npm run lint` | 0 errors, 12 warnings (cosmetic) |
| `npm run build` | 39 routes built, exit 0 |
| Runtime boot | `/login` 200; `/dashboard` (unauth) 307→`/login?from=…`; `/api/auth/session` 200/null; `/intake/[bad]` 200 |
| Runtime login (OWNER) | CSRF→POST credentials→302→`/dashboard`; session returns `{role:OWNER, centreId}`; authed `/dashboard` 200 |

**Fixes applied during stand-up:** (1) created `reference-material/formats/MBD Master Data (1).xlsx` alias (seed/smoke-admin expect the "(1)" name; only `MBD Master Data.xlsx` was present); (2) added `reference` to `tsconfig.json` `exclude` (the build's TS check was type-checking `reference/clinic2-codebase` Prisma-6 code); (3) added `scripts/run-smokes.mjs` — cross-platform runner that loads the full `.env` (incl. `SOFFICE_BIN`) via `node --env-file`, replacing the bash `run-all-smokes.sh` which only exported `DATABASE_URL`.

## Key strategic finding — Phase B is enrich+polish, NOT a framework swap

**OG's `src/app/globals.css` is already Clinic 2's design language.** It states it "lifted the warm neumorphic design language from the legacy codebase" (= Clinic 2). Tokens are effectively identical: `--primary:#2a7db8`, `--background:#f8f7f5`, `--card:#fff`, the 3-tier text hierarchy, surface layers, `.neumorphic-card`, `.bg-gradient-app`, `.btn-primary-dark`, Inter font.

The real gap: OG ships **8 UI primitives on Radix**; Clinic 2 ships **55 on Base UI** (`@base-ui/react` + `shadcn/tailwind.css` + `tw-animate-css`). A wholesale Base-UI port would force-migrate OG's tested pages and risk regressions. **Decision:** deliver Clinic 2's *look* (the user's actual intent) by keeping OG's Radix stack, adding the missing globals.css utility classes (`.stat-pill`, `.hover-lift`, `.press-scale`, `.animate-shimmer/-subtle-pulse`, `.custom-scrollbar`, sidebar/chart `@theme` tokens) and shell polish, and adding richer components on Radix as needed. Same visual result, no risky framework swap. (Revisit only if a specific component is materially better in Base UI.)

## Punchlist (12) — status going into B–H

| # | Item | Status | Where addressed |
|---|---|---|---|
| 1 | FO save+continue at consent | Assign→consent flow exists; FO has `patients:assign_therapist` + consent API. **Verify gate as FO.** | D |
| 2 | Digital-sig disclaimer + pad/upload | **Satisfied** — both paths + disclaimer present in `assign-client.tsx`. Tweak copy to punchlist wording. | D |
| 3 | FO doesn't pick service | **Satisfied** — no service picker on assign; therapist recommends. | (keep) |
| 4 | Multiple therapists at intake | **Satisfied** (checkbox multi-select). Missing explicit **primary** selector (first-selected is silent). | D |
| 5 | Recents tab for invoicing | New-invoice form has flavors + line editor. **Verify Recent/All/Products tabs + search.** | D |
| 6 | Packages working | Recommendation→package roundtrip passes smoke. **Verify detail screen (serviceMix, progress, linked sessions).** | D/E |
| 7 | Audit everything incl. stock | **Satisfied** — audit covers 20+ entities; smokes show SOLD/USED logs. Extend to new staff CRUD. | C/G |
| 8 | Client flags surfaced | Flags admin + model exist. **Verify badges on list/detail/calendar/assign/invoice; add where missing.** | D |
| 9 | Validate reschedule | Clash-check on drag + change-request reschedule. **Add future/working-hours/±15min checks w/ specific errors.** | D |
| 10 | Therapist flow rock solid | Draft/lock/PDF/inventory/change-request all work (smoke-clinical PASS). Add **autosave**. | E |
| 11 | Forms match DOCX 1:1 | Strong coverage (smoke-followups renders 11 templates). **Physician consultation exam section thin** → complete. | E |
| 12 | Credentials for everyone | **Satisfied** — 22 staff across all roles/depts, `mbd2026`. | (keep) |

## Two confirmed OG bugs (Phase F)

1. **Greeting name-split** — locate the dashboard greeting that does `name.split(" ")[0]` (shows "Welcome, Dr."); greet with full `Staff.name` + optional `displayName`.
2. **Silent redirect** — `src/app/dashboard/patients/[id]/clinical/page.tsx` `redirect("/dashboard/patients")` on no-assignment → replace with a blocking modal; keep view-only for reassigned-away.

## Features OG lacks vs Clinic 2 (Phase C)

- **Org-hierarchy view** (`/dashboard/admin/hierarchy`) — OG has none.
- **Staff CRUD** — OG only activate/deactivate + password-reset; **no create/edit employee UI**. Port Clinic 2's create/edit/soft-delete (on OG's session-derived-`performedById`, audited).

## Notes / smaller items (Phase G)

- **`middleware`→`proxy` deprecation** (Next 16.2.5 warns) — rename `src/middleware.ts`→`proxy.ts` later; non-blocking.
- **Lint:** 12 warnings (unused vars in `payments/route.ts`, `owner.tsx`, `products-client.tsx`; `<img>` for base64 signatures in `assign-client.tsx`/`profile-client.tsx`; 3 orphan eslint-disable in `cron/scheduler.ts`). Tidy in G.
- **`npm audit`:** 11 vulns (8 moderate/2 high/1 critical), transitive — review in G.
- **Services count:** 45 seeded (PRD says 60; OG noted 48). Dedup of consultant subgroupings; distinct billable line items. Acceptable.
- **`reference-material/formats`** kept at root so seed/scripts resolve the master-data XLSX unchanged; `reference-material/legacy-codebase` was NOT copied (lint noise).

---

## Phase E — clinical-form verification (2026-05-27)

**Digital capture (the user's core ask) is MET and verified.** `clinical-schemas.ts` shows every department's form captures the full DOCX field set (physio: 10 exam tables/84 leaf fields; physician: vitals/comorbidities/allergies/PMH-PSH-FH/personal/meds + labs/imaging/referrals/wellness; FAB: 4 batteries; the 3 rebuilt intakes; 6 follow-ups). `resolveClinicalTemplate` routes each department to the correct form and Massage→none. `smoke-clinical` (physio consultation, 84 fields → 239KB PDF) and `smoke-followups` (all 11 templates render; 2 PDFs) pass. Therapist flow (draft save/resume, complete-lock, PDF, inventory-usage, change-request, profile password/signature) is present and smoke-covered (#10).

**PDF-rendering fidelity backlog (#11) — captured digitally but not yet printed by the DOCX (placeholders absent in the template). Documented with anchors for a focused, render-verified follow-up; not done now to avoid blind multi-template DOCX surgery:**
- **Consultant signature** (`{{%consultantSignature}}`): present only on the 3 rebuilt intakes (Yoga/Counselling/FAB). Missing on PHYSICIAN_CONSULTATION, PHYSIOTHERAPY_CONSULTATION, COMMON_PATIENT_INTAKE, and the 6 follow-ups. Anchors found: physio = `"Signature of Physiotherapist & Date:_________"`; physician ends in a `Signature … Date` block. (Follow-ups already have a per-row `{{sign}}` column.)
- **Physician**: `LAB INVESTIGATIONS`, `INTERNAL REF`, `WELLNESS PROGRAM` appear as static labels with no `{{lab.*}}/{{imaging.*}}/{{ref.*}}/{{wellnessProgram.*}}` checkbox placeholders; `"Plan of Care & Advice:"` has no `{{planOfCare}}` after it. The form captures all of these — they just don't render.
- **Physiotherapy**: `"Provisional Diagnosis:"` has no `{{diagnosis}}` placeholder after it; the tightness exam table loop is also unwired (known from OG PROGRESS).
- **Root cause:** `scripts/inject-placeholders.ts` *already defines* rules for `planOfCare`, `lab.*`, `imaging.*`, `ref.*`, `wellnessProgram.*` (physician) and `differentialDiagnosis` (physio), but the shipped templates were injected by an earlier script version and lack them. **No consultant-signature rule exists for either consultation target.**
- **Do NOT simply re-run the full injection.** The apply logic (`inject-placeholders.ts:512-522`) is **not idempotent** for narrative rules: `match: "Chief Complaints:"` still matches inside the already-injected `"Chief Complaints: {{chiefComplaints}}"`, so a re-run **doubles** existing placeholders and corrupts the template.
- **Safe mechanism to close:** add a *guarded* supplemental pass (a new rule set that `continue`s when the target placeholder string is already present in the XML), anchored on the labels found above (mind `&amp;` + Word run-splitting), run per-template via a presence-guarded injector, then re-run `smoke-followups` + `smoke-clinical` to confirm renders. Best done against the client's authoritative source DOCXs with PDF render-diffing.
## Phase G — production hardening (2026-05-27)

**Done:**
- **Security headers** (`next.config.ts` `headers()`): X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, X-DNS-Prefetch-Control off, Permissions-Policy (camera/mic/geo denied), HSTS. Verified present at runtime.
- **DEV super-account gated to non-production** (`prisma/seed.ts`): `dev@mbd.in` is only seeded when `NODE_ENV !== "production"` (audit H-3).
- **Audit coverage** confirmed complete (punchlist #7): 25 API routes call `createAuditLog` covering Client/Invoice/Payment/Session/Consultation/Package/Staff/Service/Promotion/Centre(clinics)/InventoryItem+Log/ClientFlag/Appointment/ChangeRequest/ReferralSource/Attendance/IntakeToken/IntakeForm/Assignment + the new staff CRUD. Un-audited routes are non-domain (centre-switch cookie, notification read-toggles, cron trigger).

**Hardening backlog (recommended; deferred to avoid risk/schema churn — see HANDOFF):**
- **`nextClientCode` race** (`src/app/api/intake/[token]/submit/route.ts:56`): uses `client.count()+1` (global), race-prone on concurrent intakes (audit H-4). Fix: per-centre atomic counter (like `InvoiceCounter`) or retry-on-P2002. Low probability at single-clinic scale.
- **Force password change on first login**: seed uses the universal `mbd2026`. Not implemented (would break instant demo logins + needs a `Staff.mustChangePassword` field + redirect flow). Recommended for prod cutover.
- **MFA + login rate-limiting/lockout**, **Prisma migrations** (currently `db push`), **Vitest** unit tests (permissions/billing/ID-gen), **strict CSP** (needs per-request nonce at the proxy). All flagged in HANDOFF.

## Phase E — closed via `scripts/inject-supplemental.ts` (guarded + idempotent): physiotherapy consultation `{{%consultantSignature}}` (now stamps the clinician signature) + physician `{{planOfCare}}` (now prints plan of care). Renders re-verified (`smoke-clinical` + `smoke-followups`). **Remaining** for the same guarded approach: physician lab/imaging/ref/wellness checkboxes, physician signature anchor, physio provisional-diagnosis placeholder, and consultant signature on the 6 follow-ups (which already carry a per-row `{{sign}}` column).

---

## Production audit pass (2026-05-28) — 3 Explore agents + verification

**Fixed & committed** (branch `feat/merged-build`):
- **Phase 1 — backend correctness** (`44c70aa`): `clientCode` race → atomic per-centre `ClientCodeCounter` inside the intake txn; PDF render try/catch → DOCX fallback (no 500 on LibreOffice failure); payments GET centre-scoped (cross-centre leak) + exact rounding remainder; **MIS discount now allocated** across rows (invoices + packages) so the discount column is real and rows reconcile to the invoice total; change-request reschedule approval enforces `validateAppointmentTiming`; inventory decrement is now an atomic conditional `updateMany` (no oversell). (Patient-type was already centre-scoped — agent false-positive. Centre-switch cookie left `httpOnly:false` intentionally.)
- **Phase 2 — QR temp name** (`21df197`): `IntakeToken.label` + FO input; friendly name shown instead of the raw token id.
- **Phase 3 — audit trail** (`afd600a`): plain-English summary + expandable `<details>` humanized field/old→new diff (no more raw JSON).
- **Phase 4a UI** (`cf07b45`): dashboard error boundary; loading skeletons for admin/sessions/packages/patient-detail/calendar/intake; responsive intake-QR.
- **Phase 4b UI** (`79dc6dd`): calendar booking + cancel dialogs moved to the accessible Dialog kit (focus trap, Esc, animation, ARIA); removed the hand-rolled `DialogShell`.

**UI-polish pass — DONE (`a91d223`→`e2af34a`):**
- **Batch 1 (`a91d223`)** — the 6 server GET-form filter `<select>`s + filter-bar date inputs unified via `nativeControlClass` (`src/lib/select-styles.ts`), matching the `Input`/`SelectTrigger` look. These stay native (real `<form method=get>`, no JS).
- **Batch 2 (`1f7b06a`)** — all 25 interactive client-state `<select>`s → Radix `Select` (calendar, invoice creator, assign, record-payment, change-requests, admin flag/promo/clinic dialogs, package builder, clinical inventory + recommended-service pickers). Empty choices use the `SELECT_NONE` sentinel (Radix forbids `SelectItem value=""`) or a `SelectValue` placeholder; all `onChange` side-effects + `disabled` preserved. The patient-facing `/intake` sex field is intentionally left native (mobile picker + bespoke validation).
- **Batch 3 (`09e5fc4`)** — `<EmptyState>` on admin promotions / clinics / staff / flags (staff distinguishes "no staff" vs "no search match").
- **Batch 4 (`d617e62`)** — per-type lucide icons on flag badges (VIP/CAUTION/OVERDUE/FOLLOWUP/CUSTOM).
- **Batch 5 (`e2af34a`)** — clinical-record **debounced draft autosave**, serialised through one promise chain + `activeIdRef` (no duplicate consultations), never flushing inventory or COMPLETEing on auto, with a Saving/Saved/failed indicator.
- Verified already-consistent (no change needed): filter-card neumorphic styling; audit diff font (`text-sm`/14px). Segment-level `error.tsx` for billing/admin judged redundant — the dashboard-level boundary already renders the on-brand card within the nav.

**Remaining UI polish (cosmetic, optional):** upgrade the plain `<p>` empty messages on sessions / billing-packages / invoices to `<EmptyState>` for parity (they already show a message); searchable combobox for very long patient/service lists.

**Deferred hardening (need schema/raw-SQL/infra; low urgency):** onDelete cascades (no delete endpoints exist), `ClientDoctorAssignment` partial-unique (Postgres partial index via raw migration), force-password-change, MFA/rate-limiting, Prisma migrations, strict CSP, Vitest. Tracked in HANDOFF.
