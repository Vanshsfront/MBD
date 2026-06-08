# Test plan blueprint — pick-up-ready

> Implementation deferred from the audit-fixes/2026-06-06 batch per user
> request. This document is the next sprint's pick-up-ready spec.

## Tooling decisions

| Layer | Tool | Why |
|---|---|---|
| End-to-end | **Playwright** | Already a devDependency at `@playwright/test ^1.60`. Built-in Next.js webServer support, auto-trace on failure, single binary for all browsers. |
| Unit | **Vitest** | Native ESM, native TypeScript, ~4× faster than Jest cold start, identical `describe`/`it`/`expect` API. |
| CI | **GitHub Actions** | Free, GitHub-native. Use existing dependabot.yml as evidence of the convention. |
| Lint | **ESLint** (already configured via `eslint-config-next`) | Add `eslint-plugin-security` later for Phase 2. |
| Typecheck | **tsc --noEmit** (already in `package.json:typecheck`) | Run as a separate CI step before tests. |

## Files to create

1. `playwright.config.ts` — base URL `http://localhost:3000`, project = chromium, webServer auto-starts dev server, retries=2 on CI, html reporter.
2. `vitest.config.ts` — `environment: "node"` (most units are server-side libs), path aliases mirroring `tsconfig.json`.
3. `.github/workflows/ci.yml` — typecheck → lint → vitest → playwright; matrix only for Node version pinning; cache `~/.npm`.
4. `tests/e2e/*.spec.ts` — see "First 5 E2E tests" below.
5. `tests/unit/*.test.ts` — see "First 5 unit tests" below.
6. `tests/helpers/db.ts` — Prisma fixture loader; reads from a separate `DATABASE_URL_TEST` env var so tests never run against the live DB.

## First 5 end-to-end tests (priority order)

### E1 — Login happy path
- Navigate to `/login`.
- Fill `helen@mbd.in` / `mbd2026`.
- Submit. Expect URL to be `/dashboard`.
- Assert that `AuditLog` has one new row with `action: "LOGIN"`, `performedById: <Helen's staff id>`.
- Why first: every other test depends on auth working.

### E2 — Patient intake submission
- Seed a fresh `IntakeToken` via API (or DB helper).
- Navigate to `/intake/<token>`.
- Fill the two-page form with valid data.
- Submit. Expect `200`.
- Assert `IntakeToken.status = "COMPLETED"`, `Client` row exists with the filled fields, `IntakeForm` row exists.
- Why second: covers the highest-volume external-facing surface.

### E3 — FO walk-in book → calendar
- Login as Helen.
- Use the walk-in flow to create a Client.
- Book an appointment for that client with therapist Aanchal.
- Navigate to `/dashboard/calendar`.
- Assert the appointment renders on the calendar at the chosen time.
- Why third: covers Journey A end-to-end with the most cross-system state changes.

### E4 — Therapist session end → package decrement
- Pre-seed: a Client with an `ACTIVE` Package (3 sessions remaining), and an `IN_PROGRESS` Session attached to that package.
- Login as the therapist who owns the session.
- Click "End session".
- Assert `Session.status = "COMPLETED"`, `Package.completedSessions` incremented by 1, audit log entry written.
- Why fourth: the most subtle financial-state transition; high regression value.

### E5 — FO records payment → invoice status flip
- Pre-seed: an `Invoice` with `status: "SENT"` and `paidAmount: 0`.
- Login as Helen.
- Navigate to the invoice detail page.
- Record a payment for the full amount.
- Assert `Invoice.status = "PAID"`, `Payment` row created with the right `recordedById`, `MisEntry` rows updated proportionally, audit log written.
- Why fifth: highest financial risk per fix; doubles as a regression test for F-008 (idempotency).

## First 5 unit tests

### U1 — `hasPermission()` matrix exhaustive
- Import `ROLES`, `PERMISSIONS`, `hasPermission` from `@/lib/permissions`.
- For every (role, permission) pair, assert `hasPermission(role, permission)` matches the documented matrix.
- ~6 roles × ~31 permissions = ~186 assertions; data-driven via `it.each`.

### U2 — Intake `validatePage()` happy + sad
- Load `validatePage` from `intake-form-shell` (export it for testing).
- 10 fixtures: missing each required field, valid full form, email regex edge cases (`foo@bar.x` should fail), phone-only-digits-too-short.
- Each fixture asserts the exact `errors` object shape.

### U3 — Invoice line math
- Load `computeInvoiceTotals` from `@/lib/discount`.
- 10 fixtures: 0% GST, 18% GST, mixed line-level discount, 100% line discount, 0 lines (rejected), promotion code applied.
- Each asserts `subtotal`, `totalGst`, `totalAmount`, `discountAmount` to 2dp.

### U4 — `activeCentreId()` cookie-override authorisation
- Mock the auth session + the `next/headers` cookies API.
- Three scenarios: (a) no cookie → returns staff's centreId; (b) cookie set but role can't switch → cookie ignored, returns staff's centreId; (c) cookie set + OWNER/DEV → cookie wins.

### U5 — `assertCentreScope()` decision matrix
- Mock the auth user and resource shapes.
- Six scenarios:
  - centre match → null (allowed).
  - centre mismatch + role=FRONT_OFFICE → 403.
  - centre mismatch + role=DEV → null (allowed; engineering escape hatch).
  - resource.centreId = null → null (allowed; centre-agnostic).
  - resource = null → null (caller handles 404).
  - no active centre → 403.

## Coverage gate

- **Statements ≥ 60%** on `src/lib/*` (the pure-logic surface area).
- No coverage gate on `src/app/**` yet — those routes are exercised via E2E.
- `vitest run --coverage` produces an LCOV report; gate fails CI if the number drops.

## CI workflow shape (sketch)

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20.x", cache: "npm" }
      - run: npm ci
      - run: npx prisma generate
      - run: npx prisma migrate deploy
        env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres" }
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit -- --coverage
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres" }
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }
```

## Effort estimate

| Slice | Effort |
|---|---|
| Scaffold playwright.config.ts + vitest.config.ts + db helper | 0.5 day |
| E1–E5 (with seeding helpers) | 3 days |
| U1–U5 | 2 days |
| GitHub Actions workflow + dependency caching | 0.5 day |
| Flaky-stabilisation + first three review cycles | 1 day |
| **Total** | **~7 dev-days** |

## What this batch did NOT do

- Wrote no test runner config.
- Wrote no actual tests.
- Wrote no CI workflow.

All of the above wait on a dedicated test sprint. This document is the
spec to hand the next engineer (or yourself, in two weeks).

Reference: `review/audit-2026-06-06.md` F-010, TEST-001..TEST-008.
