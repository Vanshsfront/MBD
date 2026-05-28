# Locked decisions from the audit-fix sessions

These are the design choices made while shipping commits `d2c204c` and `c8589bb`. They're locked — don't undo without a reason.

---

## Architectural

### 1. Atomic invoice numbering — two counter tables, not `count(*)`

**File:** `src/lib/invoice-numbering.ts`, schema `prisma/schema.prisma`.

The invoice number is `{slug}/{seq:0000}/{branch:000}-{yyyy}`. Two atomic counters:

- `InvoiceCounter` keyed on `(centreId, financialYear)` — per-FY monotonic sequence
- `InvoiceMonthlyCounter` keyed on `(centreId, yearMonth)` — per-month branch counter

Both use Prisma `upsert + increment`. The `branchCounter` was previously `count(*)` of current-month invoices — non-atomic, two concurrent creates could collide on the `Invoice.invoiceNumber @unique`. Do NOT revert.

### 2. Centre cookie is `httpOnly: true`; switcher uses SSR props

**Files:** `src/app/api/centre-switch/route.ts`, `src/lib/centre.ts`, `src/components/layout/centre-switcher.tsx`, `src/components/layout/dashboard-shell.tsx`.

The `mbd-centre` cookie was originally non-httpOnly so the client could label the switcher. We verified the switcher only consumes `activeCentreId` via SSR props from the dashboard layout — no client-side cookie read needed. Cookie is now `httpOnly: true`. Don't loosen.

If you ever need the client to know the active centre, add a tiny `GET /api/me/active-centre` endpoint that returns `{ centreId, slug, name }` — don't put it back in the cookie.

### 3. Session lifetime is 8h, not 30 days

**File:** `src/lib/auth.ts`.

`session: { strategy: "jwt", maxAge: 8 * 60 * 60 }`. Long enough for a clinical shift; short enough that an unattended kiosk re-prompts before the next morning. Don't extend without addressing the kiosk concern.

### 4. bcrypt cost is 12, centralized

**File:** `src/lib/auth.ts` exports `BCRYPT_COST = 12`. All four hash sites import it: seed, admin staff create, admin password reset, profile password change. `bcrypt.compare` reads cost from the hash, so existing 10-cost rows still validate — only new writes pay the higher cost.

If you bump again (e.g. to 14), measure: cost 14 = ~16× cost 10. Seed of 22 staff at cost 14 takes ~3.5 s.

### 5. CSP is "pragmatic v1", not strict nonce

**File:** `next.config.ts`.

`default-src 'self'` with `'unsafe-inline'` on script + style (Next bootstrap needs it). `'unsafe-eval'` only in dev (HMR). `img-src 'self' data: blob:`. Strict nonce belongs at the reverse proxy. Don't drop the policy entirely — even "v1" blocks the easiest XSS vectors.

### 6. Two-tab clinical race: app-level transaction guard

**File:** `src/app/api/consultations/route.ts` (POST handler).

Inside a `prisma.$transaction`, look for an existing DRAFT for `(clientId, templateKey, consultantId)` and update it instead of creating a new row. Prisma can't express a partial unique (`WHERE status = 'DRAFT'`) so we close the window at the app layer.

A raw-SQL partial unique index is on the backlog (`D18`); when it lands, the app-level check stays as belt-and-braces.

### 7. Overpayment is rejected, not absorbed into a deposit field

**File:** `src/app/api/payments/route.ts`.

`POST /api/payments` returns 409 if `amount > outstanding + 0.01`. The schema has a `MisEntry.excessAmount` column for the "deposit" pathway, but no UI surfaces it — for now an overpayment forces the user to either reduce the amount or use a different workflow (e.g. record two separate payments). Don't silently absorb the difference.

---

## UX

### 8. Sidebar active state derives from `usePathname()` in a client `NavLink`

**File:** `src/components/layout/nav-link.tsx`.

In Next.js 16 App Router, layouts are cached across client-side navigation. A server-rendered `pathname` prop sourced from a request header is read once and stays stale. The fix is to make `NavLink` a `"use client"` component using `usePathname()` directly. Don't put `pathname` back on the server side.

While here we added `aria-current="page"`.

### 9. Clinical lock requires content + confirm

**File:** `src/components/clinical/clinical-shell.tsx`.

Locking a consultation is irreversible (append-only afterwards; only OWNER can edit). Before flipping `status` to `COMPLETED`:
1. Check the form has meaningful content (`chiefComplaints`, `diagnosis`, `planOfCare`, `followUp`, `recommended`, or any populated `formData` field)
2. `window.confirm("Lock this record as completed?")`

Don't drop either gate without an alternate path for "unlock" (which today is "call the Owner").

### 10. Empty states use the `<EmptyState>` component

**File:** `src/components/ui/empty-state.tsx`.

Bare `<p>None yet</p>` is banned. Use `<EmptyState title="..." description="..." />` with optional `action` slot. For tight card slots, pass `className="border-none p-6"` to drop the dashed border.

### 11. Notification dropdown items are `<button>`, not `<li onClick>`

**File:** `src/components/layout/notification-bell.tsx`.

The row is now a `<button>` with `aria-label`. Don't put click handlers on `<li>` again. The deep-link sits as a sibling element below the button (not inside) to avoid invalid nested-interactive HTML.

---

## Reporting / data integrity

### 12. URL params on reports are clamped

**Files:** `src/app/dashboard/reports/defaulters/page.tsx`, `src/app/dashboard/reports/mis/page.tsx`.

- Defaulters: `windowDays ∈ [1, 365]`, `threshold ∈ [1, 100]`
- MIS: `from`/`to` NaN-safe; range capped at 3 years (covers FY-spanning audits, prevents table scans)

Any new report that takes URL params should follow the same pattern with a small `clamp()` helper.

### 13. Promotion validation: cross-field at create, against existing row on PATCH

**File:** `src/app/api/admin/promotions/route.ts`.

Create schema uses Zod `.refine()` for `PERCENT ≤ 100` and `validFrom ≤ validUntil`. PATCH can't see `discountType` (you can't change it post-create), so the same checks run against the existing row's values inside the handler.

### 14. Audit log is best-effort silent-fail

**File:** `src/lib/audit.ts`.

`createAuditLog` catches and `console.warn`s on failure. The mutation succeeds even if the audit row doesn't write. **This is a known trade-off** — making it fail-closed would mean a Postgres blip blocks every mutation. The right long-term fix (D5) is alerting on audit failures via an ops channel. For now, the silent-fail is documented as a backlog item; don't change without addressing the operational concern.

---

## Out of scope (Phase 2, intentionally not built)

These have manual fallbacks but no integrations. Don't build them under "I'll just add this":

- Razorpay live (manual UPI/cash dropdown exists; `RAZORPAY` is a method label)
- WhatsApp Business / SMS / email automation (in-app notifications only)
- DocuSign / legally-binding e-sign (signature pad + scan upload exist with disclaimer)
- Salary / incentive auto-calculation (no matrix; raw counts only)
- AI receipt OCR (explicitly killed by client)
