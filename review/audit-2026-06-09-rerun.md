# MBD Clinic OS — Universal Audit Rerun (2026-06-09)

Branch: `audit-fixes/2026-06-06`. Target: https://mbd-y24p.vercel.app/. This rerun covers 7 dimensions not in the first 13-dimension pass: 2 (Authorization & Access Control), 6 (Infrastructure, Deployment & Cloud Posture), 7 (CI/CD Pipeline & DevSecOps), 12 (Frontend Architecture & React Lifecycle), 14 (Build, Bundle & Performance Budgets), 16 (UI, Layout & Visual Polish), 17 (UX, Interaction & Form Design).

PHI in scope; HIPAA-aligned marketing claim live; DPDPA 2023 in force. No prod credentials; authenticated checks recorded as CANNOT_ASSESS with worst-case severity per skill protocol §5.

---

## Rerun Executive Summary

Seven new dimensions. Eighteen new findings. Five HIGH (one IDOR, one infrastructure WAF gap, three CI/CD absence findings; plus two HIGH structural items rolled up: branch protection unverifiable and CI secret handling unverifiable). The dominant new theme is CI/CD absence — the repo ships with zero GitHub Actions workflows, which is the upstream cause of SUPPLY-001 reaching production and of every future regression having no pre-merge detection layer. The most concrete new HIGH is AUTHZ-IDOR-001: four `/api/clients/[id]/*` and `/api/flags` routes miss `assertCentreScope`, enabling cross-centre IDOR for authenticated FO staff. Paired with DATA-006 (RLS disabled) it removes both application and database multi-tenant defense for those routes.

WAF posture (INFRA-003) is a clean FAIL — no WAF-indicating headers in the response chain, no `vercel.json` firewall config, no proxy in the DNS chain. UX/UI/FE findings are engineering-hygiene grade (LOW/MEDIUM) — the codebase is generally well-engineered (intake form blur-then-validate, Radix-managed modal scroll-lock, web-vitals RUM already wired).

---

## Dimension 2 — Authorization & Access Control

Verdict counts: PASS=3, FAIL=2, PARTIAL=6, N/A=1, CANNOT_ASSESS=0 (12 checks).

**AUTHZ-IDOR-001 · HIGH · Multiple `/api/clients/[id]/*` and `/api/flags` routes miss `assertCentreScope` — cross-centre IDOR**
- Location: `src/app/api/clients/[id]/portal-token/route.ts:22`, `src/app/api/clients/[id]/recent-services/route.ts:29-47`, `src/app/api/clients/[id]/top-therapists/route.ts:13-34`, `src/app/api/flags/route.ts:24-101`.
- Root cause: per-route opt-in scope check rather than a Prisma middleware or global guard; the audit-2026-06-06 pass only fixed the most prominent routes (clients/[id] PATCH, appointments, invoices).
- Remediation: after every `prisma.client.findUnique` add `const scope = await assertCentreScope(auth.user, client); if (scope) return scope;`. Add integration test asserting Centre A FO → Centre B client ID → HTTP 403 `forbidden_centre_scope`.
- Compliance: HIPAA §164.308(a)(4), GDPR Art. 5(1)(f), SOC 2 CC6.3, DPDPA 2023 §8.

**AUTHZ-DENY-002 · MEDIUM · API routes use opt-in authorization (no deny-by-default middleware for `/api/*`)**
- Location: `src/middleware.ts:19-30` only gates `/dashboard/*`.
- Root cause: per-route opt-in pattern; new contributor adding `/api/internal/foo/route.ts` without auth import ships unauthenticated PHI endpoint with no CI signal.
- Remediation: middleware returns 401 for any `/api/*` not in explicit PUBLIC_API allowlist when `req.auth` is null; add integration test enumerating every `route.ts` under `src/app/api`.

**AUTHZ-AUDIT-003 · MEDIUM · Auth failures and 403 denials are not audit-logged**
- Location: `src/lib/auth.ts:75-112`; `src/lib/api-auth.ts:46-52`.
- Root cause: `createAuditLog` is mutation-centric; no AUTH_FAIL or AUTHZ_DENY action exists.
- Remediation: write AuditLog rows on every wrong-password / inactive-account / rate-limited authorize() failure and on every requirePermission 401/403; carry the permission requested + IP/UA.
- Compliance: HIPAA §164.312(b) audit controls; SOC 2 CC7.2.

**AUTHZ-CSRF-004 · LOW · No explicit CSRF protection for state-changing `/api` routes beyond NextAuth's own endpoints**
- Location: all `src/app/api/**/route.ts` POST/PATCH/DELETE handlers; `src/lib/auth.ts:66`.
- Root cause: implicit `json + SameSite=Lax + cookie` triad; no explicit double-submit token; defense holds today only because Next.js default same-origin + JSON forces preflight.
- Remediation: set `cookies.sessionToken.options.sameSite='strict'` + `secure: true`; add middleware Origin/Referer enforcement for POST/PATCH/DELETE/PUT.

---

## Dimension 6 — Infrastructure, Deployment & Cloud Posture

Verdict counts: PASS=1, FAIL=1, PARTIAL=2, N/A=3, CANNOT_ASSESS=4 (11 checks). Backend/Vercel-dashboard posture marked CANNOT_ASSESS with worst-case severity per §5 protocol.

**INFRA-003 · HIGH · No Web Application Firewall in front of PHI app**
- Location: `https://mbd-y24p.vercel.app/` returns `Server: Vercel` with no WAF headers; no `vercel.json` firewall block; no Cloudflare proxy in DNS chain.
- Root cause: Vercel Firewall (paid feature) never enabled; project deployed without fronting via Cloudflare/Akamai.
- Remediation: enable Vercel Firewall with OWASP managed ruleset in blocking mode, or front the apex via Cloudflare with WAF managed rules; document WAF posture in `reference/security-posture.md`.

**INFRA-004 · MEDIUM · No application-layer DDoS / abuse rate-limit at edge**
- Location: `src/lib/rate-limit.ts` (in-process Map per AUTH-010); no edge rate-limit on `/api/auth/*`, `/api/portal/[token]`, `/api/intake/[token]`.
- Root cause: rate limiting implemented in app code with stateless Map that resets on Vercel cold start; no Upstash/KV/Cloudflare RL wired.
- Remediation: integrate Upstash Redis or Vercel KV into rate-limit.ts; add per-IP and per-token limits on token-based PHI routes; declare rate-limit in `vercel.json` firewall.

**INFRA-006 · LOW · Pre-auth login page cached at Vercel edge without `no-store`**
- Location: `/login` returns `Cache-Control: public, max-age=0, must-revalidate` + `X-Vercel-Cache: HIT` + `Age: 2833`.
- Root cause: Next.js prerendered `/login` as static; Vercel CDN caches with `must-revalidate` but `public`.
- Remediation: add `export const dynamic = 'force-dynamic'` and `export const revalidate = 0` to `src/app/login/page.tsx`.

---

## Dimension 7 — CI/CD Pipeline & DevSecOps

Verdict counts: PASS=1, FAIL=4, PARTIAL=1, N/A=0, CANNOT_ASSESS=4 (10 checks). Repo has no `.github/workflows/` directory at all — only a `dependabot.yml`.

**CICD-003-F1 · HIGH · No SAST step on pull requests** — `.github/workflows/` directory missing. Add CodeQL + Semgrep on every PR; gate `main` branch protection on the new check.

**CICD-004-F1 · HIGH · No PR-time dependency CVE scan** — Direct consequence: SUPPLY-001 reached production. Add `npm audit --audit-level=high --omit=dev` and `actions/dependency-review-action@v4` on every PR; require on `main`.

**CICD-005-F1 · HIGH · No PR-time secret scanning** — No `.gitleaks.toml`; GitHub Advanced Security secret scanning default OFF for private repos. Add `gitleaks/gitleaks-action@v2`; enable GH Advanced Security + push protection.

**CICD-001-F1 · HIGH · CI secret handling unverifiable** — Vercel project settings out-of-band. Migrate build to GitHub Actions OIDC → Vercel deploy; commit `vercel.json`; grep build log for secret patterns.

**CICD-002-F1 · HIGH · Branch protection on `main` unverifiable from repo — likely incomplete** — No `CODEOWNERS`, no `.github/branch-protection.yml`. Enable branch protection (require PR + 1 review, required status checks, restrict force push, restrict deletion); add `CODEOWNERS` for security-sensitive paths.

**CICD-006-F1 · MEDIUM · No DAST against staging before production promotion** — Add OWASP ZAP baseline scan against Vercel preview URL per PR; gate promotion-to-prod on DAST success.

CICD-010 PASSed (source maps return 403; `next.config.ts` does not enable `productionBrowserSourceMaps`).

---

## Dimension 12 — Frontend Architecture & React Lifecycle

Verdict counts: PASS=4, FAIL=0, PARTIAL=4, N/A=0, CANNOT_ASSESS=2 (10 checks). All findings are engineering-hygiene / perf / DX — no security findings.

**FE-001 · LOW · Bespoke Map-based fetch cache instead of established server-state library** — `src/hooks/use-api-cache.ts:1-152`. Migrate to `@tanstack/react-query` v5.

**FE-004 · MEDIUM · Three `exhaustive-deps` suppressions plus one useEffect with no deps array** — `patients-filter-bar.tsx:41`, `consultation-attachments.tsx:63`, `packages-client.tsx:118`; `clinical-shell.tsx:292-310`. Use React 19 `useEvent`; gate CI with `eslint --max-warnings=0`.

**FE-005 · LOW · `useApiCache` fetch is not aborted on unmount** — `src/hooks/use-api-cache.ts:55-92`. Pass `signal: controller.signal`; abort in cleanup.

**FE-008 · MEDIUM · Only two Error Boundaries — single dashboard boundary catches every child error** — `src/app/error.tsx`, `src/app/dashboard/error.tsx`. Add per-section `error.tsx`; forward errors to AuditLog.

**FE-010 · LOW · Heavy clinical-shell client bundle ships all 12 templates eagerly** — `src/components/clinical/clinical-shell.tsx:23-33`. Wrap each per-template form in `next/dynamic` + `<Suspense>`.

FE-003 and FE-007 marked CANNOT_ASSESS (need DevTools / live dev console).

---

## Dimension 14 — Build, Bundle & Performance Budgets

Verdict counts: PASS=2, FAIL=2, PARTIAL=0, N/A=0, CANNOT_ASSESS=1 (5 checks).

**BUNDLE-001 · MEDIUM · No bundle analyzer configured** — `next.config.ts:1-65` has no `withBundleAnalyzer`. Add `@next/bundle-analyzer`; add `analyze` script; document `bundle-budget.md`.

**BUNDLE-004 · MEDIUM · No Lighthouse CI performance budget** — No `lighthouserc.*`; `.github/workflows/` absent. Add `treosh/lighthouse-ci-action@v12` on PRs with assertions for performance ≥ 0.85, LCP ≤ 2500, TBT ≤ 300, script size ≤ 350kb.

BUNDLE-005 PASSed (real web-vitals RUM at `src/components/rum.tsx:61`). BUNDLE-002 PASSed (no lodash-style imports).

---

## Dimension 16 — UI, Layout & Visual Polish

Verdict counts: PASS=3, FAIL=0, PARTIAL=1, N/A=0, CANNOT_ASSESS=2 (6 checks).

**UI-003-F1 · LOW · Custom design-handoff utility classes use fixed px font-sizes that ignore browser font-size preference** — `src/app/globals.css:297, 359, 370, 411, 436, 480, 481, 497, 556, 560, 563, 576`. Convert px font-sizes in globals.css:295-583 to rem. WCAG 2.1 SC 1.4.4.

**UI-002-F1 · LOW · Default Button size (md) is 40px tall — below the 44px touch-target floor** — `src/components/ui/button.tsx:36`. Bump md to `h-11 px-4` (44px); keep `sm = h-8` only for non-touch desktop callsites.

Modal behavior (UI-005) PASSed via Radix-managed scroll lock + Tailwind animate-in/out classes. UI-001 and UI-006 CANNOT_ASSESS (need browser).

---

## Dimension 17 — UX, Interaction & Form Design

Verdict counts: PASS=4, FAIL=0, PARTIAL=1, N/A=0, CANNOT_ASSESS=2 (7 checks). `intake-form-shell.tsx` is well-engineered overall.

**UX-002 · LOW · Generic 'Required to proceed.' message on five intake acknowledgement checkboxes** — `src/app/components/intake/intake-form-shell.tsx:151-155`. Replace each generic string with a specific instruction naming the acknowledgement (consent / liability waiver / commercial terms / cancellation policy / T&C). WCAG 2.1 SC 3.3.3 Error Suggestion.

UX-001 PASSed (blur-then-validate). UX-003 PASSed (visible '*' + aria-required). UX-004 PASSed (form data preserved on error). UX-006 PASSed (App Router loading.tsx + error.tsx + 15 empty-state strings). UX-005 and UX-007 CANNOT_ASSESS (need authenticated browser).

---

## Rerun Coverage Summary

| Dim | Name | PASS | FAIL | PARTIAL | N/A | CANNOT_ASSESS | Total |
|---|---|---|---|---|---|---|---|
| 2 | Authorization & Access Control | 3 | 2 | 6 | 1 | 0 | 12 |
| 6 | Infrastructure & Cloud Posture | 1 | 1 | 2 | 3 | 4 | 11 |
| 7 | CI/CD & DevSecOps | 1 | 4 | 1 | 0 | 4 | 10 |
| 12 | Frontend Architecture | 4 | 0 | 4 | 0 | 2 | 10 |
| 14 | Build, Bundle & Perf Budgets | 2 | 2 | 0 | 0 | 1 | 5 |
| 16 | UI, Layout & Visual Polish | 3 | 0 | 1 | 0 | 2 | 6 |
| 17 | UX, Interaction & Form Design | 4 | 0 | 1 | 0 | 2 | 7 |
| **Totals (rerun)** | | **18** | **9** | **15** | **4** | **15** | **61** |

Eighteen new findings: 6 HIGH (AUTHZ-IDOR-001, INFRA-003, CICD-001-F1, CICD-002-F1, CICD-003-F1, CICD-004-F1, CICD-005-F1), 7 MEDIUM (AUTHZ-DENY-002, AUTHZ-AUDIT-003, INFRA-004, CICD-006-F1, FE-004, FE-008, BUNDLE-001, BUNDLE-004), and 7 LOW (AUTHZ-CSRF-004, INFRA-006, FE-001, FE-005, FE-010, UI-003-F1, UI-002-F1, UX-002). CICD-002-F1 is structurally a HIGH because absence of branch protection on `main` for a PHI app means any maintainer-account compromise = direct prod deploy.

The HIGH cluster is dominated by CI/CD absence (5 of 6 HIGHs are CI/CD), with AUTHZ-IDOR-001 and INFRA-003 rounding out the cross-cutting infrastructure gaps. These pair directly with first-pass findings: AUTHZ-IDOR-001 ⇄ DATA-006 (RLS off — both layers gone), CICD-004-F1 ⇄ SUPPLY-001 (no PR-time CVE scan = direct cause of xmldom reaching prod), INFRA-004 ⇄ AUTH-010 (broken at both edge and app layer).
