# MBD Clinic OS — Session Handoff (single entry point)

_Last updated: 2026-05-28. Read this first, then `HANDOFF.md` (credentials + demo walkthrough)
and `AUDIT_FINDINGS.md` (forensic findings + backlog)._

---

## 1. TL;DR — current state

- **Repo:** `E:\WORK\GOATED\Medical\mbd-clinic-merged` · **branch:** `feat/merged-build` · **working tree clean** · nothing pushed to a remote (local only).
- **App runs** at `http://localhost:3000` (a dev server is currently up; if not, see §4).
- **Verified green** at the last checkpoint: `node scripts/run-smokes.mjs` = 12 smoke scripts + `npm run lint` (0 errors) + `npm run build`.
- **What this is:** a Next.js 16 + Prisma 7 + Postgres multi-clinic clinic OS for Movement By Design (Mumbai). It is the proven **"OG"** build, reskinned in the **"Clinic 2"** design language, with org-hierarchy + employee CRUD added, per-role UX improved, two known bugs fixed, production-correctness hardened, and a fully pre-completed demo patient. **Source-of-truth order:** PRD > punchlist > audits > OG > Clinic 2.

## 2. The strategic reframe (why the build looks the way it does)

The handed-over bootstrap prompt assumed a from-scratch 6-phase "merge OG backend + Clinic 2 UI" rebuild. Direct inspection overturned that: **OG (`reference/og-codebase/`) was already a complete, tested, PRD-complete system** (39 pages, 35 API routes, all §5 schema changes, working docxtemplater/exceljs/LibreOffice pipeline, even the "missing" forms rebuilt) — and its `globals.css` was *already* Clinic 2's neumorphic palette. **Clinic 2 (`reference/clinic2-codebase/clinic/`)** was the inverse: beautiful but functionally insecure (unauthenticated routes, spoofable audit, race-prone IDs, a service-picker that breaks the FO rule, jsPDF, MANAGER role, prod DEV account).

So instead of rebuilding, we: copied OG to the repo root as the working app, finished the Clinic 2 design adoption, ported the two features OG lacked (org-hierarchy + employee CRUD), improved per-role UX, fixed bugs, hardened for prod, and added a demo patient — **never porting Clinic 2's insecure patterns**.

## 3. Repo map (where everything lives)

```
mbd-clinic-merged/
├── SESSION_HANDOFF.md     ← this file
├── HANDOFF.md             ← credentials, demo walkthrough, phase A–H summary, out-of-scope
├── AUDIT_FINDINGS.md      ← forensic audit (stand-up, clinical-form gaps, prod-audit pass, backlog)
├── README.md              ← stack + Windows/VPS run instructions + the gate
├── PROGRESS.md            ← OG's full build history + a "MERGED BUILD" banner at top
├── .env                   ← DATABASE_URL/DIRECT_URL/AUTH_SECRET/SOFFICE_BIN (git-ignored)
├── prisma/
│   ├── schema.prisma      ← 30 models (incl. ClientCodeCounter, IntakeToken.label added this pass)
│   └── seed.ts            ← idempotent seed + the COL-MBD-DEMO demo patient
├── templates/             ← DOCX clinical forms + 4 invoice XLSX flavors (filled via docxtemplater/exceljs)
├── scripts/
│   ├── run-smokes.mjs     ← cross-platform gate (12 smokes + lint + build) — USE THIS, not run-all-smokes.sh
│   ├── smoke-*.ts         ← 12 smoke tests
│   ├── inject-placeholders.ts     ← DOCX placeholder injector (NOT idempotent for narrative rules — see AUDIT_FINDINGS)
│   └── inject-supplemental.ts     ← guarded, idempotent placeholder injector (added this pass)
├── src/
│   ├── app/
│   │   ├── (auth)/login, intake/[token], portal/[token]   ← public
│   │   ├── dashboard/**   ← 39 pages; dashboard/error.tsx (boundary) + */loading.tsx skeletons
│   │   └── api/**         ← 35+ route handlers (each ~ one Prisma model)
│   ├── components/{ui,layout,clinical,admin,intake}/  ← UI kit + composites
│   └── lib/{auth,permissions,audit,centre,nav,discount,invoice-numbering,appointments,
│            clinical-schemas,master-data,templates/{docx,xlsx}}.ts
└── reference/             ← og-codebase/, clinic2-codebase/, forms/, audits/, PRD.md (read-only sources)
    └── reference-material/formats/  ← master-data XLSX the seed reads (kept so seed resolves)
```

Key libs to know: auth `src/lib/auth.ts` (NextAuth v5 credentials/JWT); RBAC `src/lib/permissions.ts` (6 roles, hasPermission); nav whitelist `src/lib/nav.ts`; audit `src/lib/audit.ts` (createAuditLog/computeChanges, performedById from session); money `src/lib/discount.ts` + `invoice-numbering.ts` (atomic InvoiceCounter); appointment rules `src/lib/appointments.ts` (validateAppointmentTiming); per-template clinical schemas `src/lib/clinical-schemas.ts` (resolveClinicalTemplate routes dept→form; Massage→none).

## 4. How to run (Windows)

Prereqs already set up on this machine: Node 22, Docker, LibreOffice at `E:/Program Files/LibreOffice/program/soffice.exe`, Postgres container `mbd-postgres`.

```powershell
cd E:\WORK\GOATED\Medical\mbd-clinic-merged
docker start mbd-postgres        # if not already running
npm run dev                      # http://localhost:3000
```
Fresh setup / after losing the DB:
```powershell
docker run -d --name mbd-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mbd -p 5432:5432 postgres:16
npm install ; npx prisma generate ; npm run db:push ; npm run db:seed ; npm run dev
```
Gate: `node scripts/run-smokes.mjs`  ·  DB GUI: `npm run db:studio`.

**Login:** any seeded account, password `mbd2026`. `marazban@mbd.in` (Owner), `ramchandra@mbd.in` (Front Office), `devanshi@mbd.in` (Therapist), `yasir@mbd.in` (Admin), `prerna@mbd.in` (Consultant), `dev@mbd.in` (DEV, dev-only). Full roster + per-role scope in `HANDOFF.md`.

**Demo patient:** `COL-MBD-DEMO` "Demo Patient — Walk-Through" (Cmd-K → "Demo") — full happy path (intake, consent, 2 assignments, completed physio consult w/ recommendations, 8-session package, paid invoice, MIS, VIP flag).

## 5. Everything done this session (chronological, with commit hashes)

**Original merged build — Phases A–H** (on top of bootstrap commit `2e93559`):
- `ede98aa` **A** — copied OG to root; verified on Windows (install, generate, db push, seed, 12 smokes incl. LibreOffice PDF, lint, build, login). Added `scripts/run-smokes.mjs`.
- `f5985f8` **B** — adopted Clinic 2 design foundation: enriched `globals.css` (chart/sidebar tokens, stat-pill/hover-lift/shimmer + `tw-animate-css`), 13 Radix UI primitives, sidebar icons. (No Base-UI migration — OG already matched the palette.)
- `fc04065` **C** — org-hierarchy view (`/dashboard/admin/hierarchy`) + full employee CRUD (`/api/admin/staff` POST/PATCH/DELETE soft-delete); shared Add/Edit dialogs. Verified create→login→edit→delete; therapist 403.
- `399fd8a` **D1** — assignment primary-therapist selector (★); reschedule validation (future/working-hours/therapist-active/clash/±15min); color-coded client-flag badges.
- `452c615` **D2** — invoice line picker with Recent/All/Products tabs + search + `/api/clients/[id]/recent-services` (punchlist #5).
- `fecd60b` **E** — verified clinical forms capture all DOCX fields + correct dept routing; closed physio consultant-signature + physician plan-of-care PDF gaps via `scripts/inject-supplemental.ts`.
- `762f923` **F** — fixed the two OG bugs: greeting honorific ("Welcome, Dr." → "Welcome, Devanshi") and silent redirect → "Access blocked" card (reassigned-away still reaches view-only).
- `c3d5c08` **G** — security headers (`next.config.ts`), DEV gated out of prod seed, audit coverage confirmed (25 routes).
- `2100347` **H** — fully pre-completed demo patient in seed; README/HANDOFF/PROGRESS written.

**Mid-session bug fix:** intake QR countdown showed "29665173 min left" because it subtracted a *tick counter* not the current time → fixed to a real timestamp synced via a deferred `setTimeout` (committed within `44c70aa`).

**Production-audit pass — Phases 1–5** (3 Explore agents + verification):
- `44c70aa` **1** — `clientCode` race → atomic `ClientCodeCounter`; PDF render try/catch → DOCX fallback; payments GET centre-scoped + exact rounding; **MIS discount allocated** (invoices + packages); reschedule-approval timing; inventory atomic conditional decrement. (Patient-type was already scoped — agent false-positive; centre cookie left `httpOnly:false` intentionally.)
- `21df197` **2** — intake QR friendly **temp name** (`IntakeToken.label`).
- `afd600a` **3** — human-readable, expandable **audit trail** (`<details>` + humanized diffs).
- `cf07b45` **4a** — dashboard error boundary, loading skeletons (admin/sessions/packages/patient/calendar/intake), responsive intake QR.
- `79dc6dd` **4b** — calendar booking + cancel dialogs → accessible Dialog kit (removed hand-rolled DialogShell).
- `6e4538e` **5** — documented audit-pass status + backlog in AUDIT_FINDINGS.

## 6. The 12 punchlist items — status

1 FO consent save+continue ✅ (already permitted) · 2 digital-sig disclaimer + pad/upload ✅ · 3 FO doesn't pick service ✅ · 4 multi-therapist + explicit primary ✅ · 5 Recent/All/Products invoice picker ✅ · 6 packages working ✅ · 7 audit everything ✅ (25 routes) · 8 client flags surfaced ✅ (list + detail header; calendar-tooltip/invoice-field still open) · 9 reschedule validation ✅ · 10 therapist flow ✅ (debounced draft autosave now done, `e2af34a`) · 11 forms 1:1 ✅ digital capture complete; some physician/follow-up PDF placeholders still open (see AUDIT_FINDINGS) · 12 credentials ✅.

## 7. Remaining backlog (none are breakages — full detail in AUDIT_FINDINGS.md §"Production audit pass")

- **UI polish — DONE (2026-05-28, commits `a91d223`→`e2af34a`):** every interactive client-state `<select>` converted to the Radix `Select` kit (25 across calendar / invoice creator / assign / change-requests / admin flag+promo+clinic dialogs / package builder / record-payment / clinical inventory+recommended-service pickers); the 6 server GET-form filter selects + filter-bar date inputs unified via `nativeControlClass` (`src/lib/select-styles.ts`); admin empty states (promotions / clinics / staff / flags) via `<EmptyState>`; per-type flag-badge icons; clinical-record **debounced draft autosave** (serialised through one promise chain + `activeIdRef` → no duplicate consultations, never flushes inventory or COMPLETEs on auto). Left native **by design**: the patient-facing `/intake` sex field (mobile picker + bespoke onBlur/aria-invalid validation). Filter-card neumorphic styling + audit diff font (already `text-sm`/14px) verified consistent — no change needed. Radix empty-value gotcha: `SelectItem value=""` throws → uses the `SELECT_NONE` sentinel.
- **UI polish — still open (cosmetic, optional):** upgrade the plain `<p>` empty messages on sessions / billing-packages / invoices lists to `<EmptyState>` for parity (they already show a message); searchable combobox for very long patient/service lists.
- **Clinical PDF fidelity:** physician lab/imaging/ref/wellness checkboxes, physio provisional-diagnosis, follow-up consultant signatures — close via the guarded `inject-supplemental.ts` against the client's authoritative source DOCXs.
- **Hardening (need schema/raw-SQL/infra):** onDelete cascades (no delete endpoints exist yet), `ClientDoctorAssignment` partial-unique index, force-password-change-on-first-login, MFA + rate-limiting, Prisma migrations (currently `db push`), strict CSP, Vitest suite.
- **Statusline:** the `/statusline` setup was started but not finished (no shell PS1 on Windows; user chose a "git-aware" format — `dir · branch · model · ctx%`). Not yet written to `C:\Users\Asus\.claude\settings.json`.

## 8. Gotchas for the next session

- **Use `scripts/run-smokes.mjs`** (cross-platform, loads full `.env` incl. SOFFICE_BIN) — NOT the legacy `run-all-smokes.sh` (only exports DATABASE_URL).
- **Stop `next dev` before `prisma generate`/`db push`** (Windows locks the query-engine DLL). Stop a dev server with: PowerShell `Get-NetTCPConnection -LocalPort 3000 -State Listen | %{ taskkill /PID $_.OwningProcess /T /F }`.
- **Start dev with the harness `run_in_background`**, not a bash `&` — a `&`-backgrounded dev killed mid-generation once left a corrupt `.next/dev/types/validator.ts` that broke typecheck/build. Fix: `rm -rf .next` and rebuild.
- **`inject-placeholders.ts` is NOT idempotent** for narrative rules (re-running doubles `{{chiefComplaints}}` etc.). To add template placeholders, use a *guarded* pass like `inject-supplemental.ts`.
- **Git commit messages:** write to a file + `git commit -F` (or avoid apostrophes) — `@'...'@` here-strings break in Git Bash on the `'` in contractions. CRLF warnings on commit are harmless.
- **C: drive is tight (~10 GB)** — keep `.next`/`node_modules` on E: (the repo is on E:, so this is automatic); LibreOffice is on E:.
- C2's `clients/[id]/assign-service` route, MANAGER role, prod DEV account, and jsPDF were intentionally **not** ported. Don't reintroduce.

## 9. Pointers
- Credentials + demo walkthrough + out-of-scope (PRD §10): **HANDOFF.md**
- Forensic audit findings + the full backlog with file:line + fix mechanism: **AUDIT_FINDINGS.md**
- Run/deploy (Windows + VPS), invoice numbering, where templates live: **README.md**
- Locked spec: **reference/PRD.md** · the two prior builds: **reference/og-codebase/**, **reference/clinic2-codebase/clinic/**
