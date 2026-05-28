# Audit findings — current state

The production-evening audit identified four P0 ship-blockers, eleven P1 same-week items, twenty P2 risks, and ~thirty P3 polish items. As of commit `c8589bb` (2026-05-28), all P0+P1+P2+P3 items from the focused batch have shipped. The remaining backlog is deferred-by-design (each item below the line needs its own session).

---

## ✅ Shipped (commit `d2c204c`, P0 + P1)

| Tag | Item | One-line resolution |
|---|---|---|
| B1 | Sidebar active state stayed stuck | `NavLink` is now `"use client"` with `usePathname()`; `aria-current="page"` added |
| B2 | Empty / qty=0 / no-patient invoice could submit | Create button disabled with inline hint; server Zod already strict |
| B3 | Overpayment silently accepted | `/api/payments` returns 409 when `amount > outstanding + 0.01`; UI disables + shows delta |
| B4 | `mbd2026` hint hardcoded into login | Now behind `NEXT_PUBLIC_SHOW_SEED_HINT=true` |
| C1 | `/dashboard/admin/attendance` had no nav entry | Added under Admin section |
| C2 | Clinical lock had no required-field gate | Require content + `confirm()` before `status=COMPLETED` |
| C3 | Two-tab clinical race produced dup drafts | `POST /api/consultations` upserts open DRAFT in a transaction |
| C4 | Invoice `branchCounter` was non-atomic | New `InvoiceMonthlyCounter` table; per-(centre, yearMonth) upsert+increment |
| C5+C11 | Missing loading/error boundaries on ~26 routes | Root `error.tsx` + `global-error.tsx` + 4 new loading skeletons |
| C6+D20 | Notification dropdown not keyboard-accessible | `<li onClick>` → `<button>` with `aria-label`; popover `max-w-[min(360px,90vw)]` |
| C9 | Six bare empty states | Swapped to `<EmptyState>` |
| C10 | Missing "Edit demographics" affordance | New dialog + `PATCH /api/clients/[id]` (audit-logged) |

## ✅ Shipped (commit `c8589bb`, P2 + P3)

| Tag | Item | One-line resolution |
|---|---|---|
| D2 | No CSP | Basic policy in `next.config.ts`; tight default-src; `unsafe-eval` only in dev |
| D3 | Centre cookie wasn't httpOnly | Flipped `httpOnly: true`; switcher already used SSR props |
| D4 | NextAuth session was 30 days | `maxAge: 8 * 60 * 60` (clinic shift length) |
| D11 | Services import had weak MIME check | Validates `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| D12 | Promo `validFrom > validUntil` accepted | Zod `.refine()` at create; row-aware check on PATCH |
| D13 | Reports lacked param bounds | Defaulters `windowDays ∈ [1,365]`; MIS NaN-safe + 3-year cap |
| D14 | `/api/search` clinical scoping | Verified locked (patients filtered, invoices empty, appointments by therapistId) |
| D16 | Centre switcher could land on 404 | Routes to `/dashboard` if URL was centre-scoped detail |
| P3-1 | Login password show/hide | Eye-icon toggle with `aria-pressed` |
| P3-2 | Intake QR small | 220 → 280 px |
| P3-3 | Label had no char counter | `x/60` counter wired via `aria-describedby` |
| P3-5 | Patient detail tabs not sticky | Sticky header carries name/status/code/flags across sub-tabs |
| P3-6 | No promo discount preview | Inline "Promo discount: −₹X" mirroring `discount.ts` order |
| P3-7 | Cmd+K missing packages/sessions | Added as quick-action destinations |
| P3-8 | bcrypt cost 10 | Centralized at 12 in `src/lib/auth.ts` (`BCRYPT_COST`); existing hashes still validate |

---

## ⏳ Deferred (each needs its own design pass + session)

These are real risks but each one is bigger than a single PR. Tag in `decisions.md` shows the reason.

| Tag | Item | Why deferred |
|---|---|---|
| D1 | No login rate-limiting / lockout | Needs per-IP counter (DB or in-memory) + lockout state model. Until landed: keep `/login` off the open internet |
| D5 | Audit log silent-fails | Needs an ops channel (Sentry/Slack) to be useful; design choice on which entities should fail closed |
| D6 | `prisma db push` instead of migrations | Workflow change, not a single PR. Affects every future schema move |
| D7 | Force-password-change on first login | Schema field + middleware + UI flow |
| D8 | MFA (TOTP) | Schema + enrolment flow + recovery codes |
| D9 | At-rest column encryption on PHI fields | Deployment + key management decisions |
| D18 | `ClientDoctorAssignment` partial unique | Raw-SQL migration; app-level guard is in place |

---

## Two retractions from the earlier audit

These were originally flagged as P0 but verifying against the source showed they weren't real:

1. **Silent redirect for unassigned clinical users** — `src/app/dashboard/patients/[id]/layout.tsx:36-44` already shows an `<AccessBlocked />` card. The `redirect()` at `clinical/page.tsx:67` is dead code behind that gate.
2. **`Centre` cookie tenant escape** — `src/lib/centre.ts:24` gates the cookie read behind `canSwitch(role)`, which excludes FO/THERAPIST/CONSULTANT. A non-Owner can't tamper their way into another centre.

---

## Verifying the shipped fixes

The audit document includes a 10-step verify-yourself checklist (`/handoff/session/what-shipped.md` cites the relevant lines). At minimum:

```
node scripts/run-smokes.mjs  → 12 smokes + lint + build, PASS in ~95s
```

Live walks:
- Sidebar pill follows nav clicks (no hard refresh needed)
- Therapist clicks unassigned patient → `<AccessBlocked />` card, not silent redirect
- Invoice form Create button disabled when patient missing or no lines
- Payment widget blocks `amount > outstanding`
- `mbd2026` hint absent on login (unless `NEXT_PUBLIC_SHOW_SEED_HINT=true`)
- Centre switch from a specific invoice URL lands on `/dashboard`, not 404
