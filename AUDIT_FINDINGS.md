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
