# What shipped — chronological log

Most-recent first. Each entry is a single commit; PR boundaries don't exist on `feat/merged-build` (working branch). Tags refer to items in `audit-findings.md`.

---

## `c8589bb` — feat: P2 security/correctness batch + P3 polish + Claude Design handoff (2026-05-28)

**Scope:** 8 P2 backend/correctness items + 8 P3 UX polish + Claude Design handoff doc.

**P2:**
- D2 — basic CSP in `next.config.ts` (dev allows `unsafe-eval`, prod drops it, `upgrade-insecure-requests` in prod)
- D3 — `mbd-centre` cookie `httpOnly: true` (switcher uses SSR props)
- D4 — NextAuth session `maxAge: 8 * 60 * 60`
- D11 — services import validates XLSX MIME (graceful fallback when browser omits MIME but file ends `.xlsx`)
- D12 — promotion `.refine()` for PERCENT ≤ 100 and `validFrom ≤ validUntil` (create + PATCH against existing row)
- D13 — defaulters report clamps; MIS report NaN-safe + 3-year cap
- D14 — `/api/search` clinical-role scoping verified + locked via comment
- D16 — centre switcher routes to `/dashboard` from centre-scoped detail URLs

**P3:**
- Login show/hide password toggle (eye-icon, `aria-pressed`)
- Intake QR 220 → 280 px
- Intake label `x/60` counter wired via `aria-describedby`
- Sticky patient-detail header across sub-tabs
- Invoice promo inline discount preview (respects max-discount cap)
- Cmd+K quick-actions extended with Packages + Sessions
- bcrypt cost 10 → 12, centralized as `BCRYPT_COST` in `src/lib/auth.ts`

**Other:** `DESIGN_HANDOFF.md` added at repo root (seed for Claude Design at claude.ai/design).

**Gate:** `[run-smokes] PASS ✅ in 94s`

---

## `d2c204c` — fix: production-evening audit — P0s + P1s + atomic invoice branchCounter (2026-05-28)

**Scope:** 4 P0 ship-blockers + 11 P1 same-week items + atomic branchCounter schema.

**P0:**
- B1 — `NavLink` → `"use client"` with `usePathname()`; `aria-current="page"` added. Sidebar pill now follows navigation. (Layout was caching the prop-sourced pathname.)
- B2 — Invoice form Create button disabled on `!clientId || lines.length === 0 || qty < 1`. Server Zod already strict.
- B3 — Payment widget blocks `amount > outstanding`. Server returns 409 with delta context.
- B4 — `mbd2026` hint gated behind `NEXT_PUBLIC_SHOW_SEED_HINT=true`.

**P1:**
- C1 — `/dashboard/admin/attendance` added to nav
- C2 — Clinical lock requires content + `confirm()` dialog
- C3 — `POST /api/consultations` upserts open DRAFT in a transaction (two-tab race guard)
- C4 — New `InvoiceMonthlyCounter` Prisma model; `allocateInvoiceNumber` uses upsert+increment for the per-month part
- C5+C11 — Root `error.tsx` + `global-error.tsx` + 4 loading skeletons
- C6+D20 — Notification dropdown `<button>` with proper a11y + responsive popover width
- C7 — `aria-current="page"` (rolled into B1)
- C9 — 6 bare empty states → `<EmptyState>`
- C10 — Edit Demographics dialog + `PATCH /api/clients/[id]` (audit-logged)

**Gate:** `[run-smokes] PASS ✅ in ~95s`

---

## `6f9d3b9` and prior — UI polish pass + audit + initial merge

The merge work (Phases A–H) plus production-audit pass (Phases 1–5) plus UI polish (Batches 1–5) are documented in `AUDIT_FINDINGS.md`, `PROGRESS.md`, `HANDOFF.md`, and `SESSION_HANDOFF.md` at the repo root. Key earlier closures:

- All 12 punchlist items from `reference/mbd-punchlist.txt`
- Atomic `ClientCodeCounter` (race fix)
- PDF fallback to DOCX on LibreOffice failure
- MIS discount allocated proportionally across line items
- Inventory atomic conditional decrement
- Humanized audit-log diffs with expandable JSON
- 11 smoke scripts + cross-platform `scripts/run-smokes.mjs` gate

---

## Cumulative state

- **Branch:** `feat/merged-build`
- **Schema models:** 30 (was 24 in legacy; +`ClientCodeCounter`, `ClientPortalToken`, `AttendanceLog`, `InvoiceMonthlyCounter`, etc.)
- **Routes:** 79 app + API routes
- **Test surface:** 12 smoke scripts + lint + build, all green at ~95s
- **Audit coverage:** 25+ routes call `createAuditLog`
- **Out of scope (Phase 2):** Razorpay, WhatsApp, DocuSign, MFA, at-rest encryption, salary auto-calc, OCR
