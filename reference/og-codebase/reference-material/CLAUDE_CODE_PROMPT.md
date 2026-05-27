# Claude Code Bootstrap Prompt — Movement By Design Clinic OS

> Paste this into Claude Code as your first message in a fresh repo. The repo should already contain `/reference-material/` with three subfolders: `PRD.md`, `formats/` (the client's actual files), and `legacy-codebase/` (the previous attempt).

---

## Your job

Build a production-quality clinic operating system for Movement By Design (MBD), a multi-modality wellness clinic in Mumbai, India. The full specification is in `/reference-material/PRD.md`. **Read it completely before writing any code.**

This is a rebuild. There is a previous attempt in `/reference-material/legacy-codebase/`. **Use it as a reference for what features must exist, not as a code source to copy.** The legacy codebase has the right schema (~85% reusable) and roughly the right routes, but its flows don't connect end-to-end, three parallel architectures coexist for clinical forms, and document generation reimplements the client's templates in jsPDF instead of using the actual files. We are fixing all of that.

## Inviolable rules

1. **Read the PRD before writing code.** Then read the formats folder. Then read the legacy codebase. In that order. Do not skip steps.

2. **The PRD is locked.** Do not ask the user clarifying questions about scope. Where contradictions in legacy code conflict with the PRD, the PRD wins. Where the user pushes back on a PRD decision in chat, ask them to update the PRD first, then re-read.

3. **Templates are literal.** All clinical forms (`*.docx` in formats folder) are filled with `docxtemplater`. All invoices (`*.xlsx` in formats folder) are filled with `exceljs`. **Never** redraw these in `jsPDF`, `react-pdf`, HTML-to-PDF, or any other rendering. The user's exact files are the templates. Modify them only by adding placeholders.

4. **Every feature must belong to one of the 5 user journeys in PRD §4.** If you build a screen, route, or API endpoint that isn't reachable through one of those journeys, you are doing the wrong thing. Stop and re-check.

5. **Three-term vocabulary.** Never use the bare word "service" in schema, variable, or UI copy unless context is unambiguous. Use `serviceCategory`, `billableService`, `treatmentProtocol`. PRD §2 explains.

6. **Audit-log every mutation.** Centralize in `src/lib/audit.ts`. No exceptions on Client / Invoice / Payment / Session / Consultation / Package / Staff / Service / Promotion mutations.

7. **Strict TypeScript.** No `any` unless explicitly justified in a comment. No `@ts-ignore` without a comment explaining why.

8. **No half-finished pages.** A page either works end-to-end or doesn't ship. "Coming in Phase 4" placeholders are not acceptable. If something is out of scope (PRD §10), don't build a stub for it — either omit it from nav entirely or build it for real.

9. **Single architecture per concern.** One way to do clinical forms (one template path → one renderer). One way to do invoices (three flavors, one renderer). One way to fetch data on the client (`useApiCache`). Don't leave parallel implementations.

10. **No dead code.** If you write a file you don't import, delete it before you commit. If you write a route nobody navigates to, delete it.

## Stack (locked, see PRD §7)

Next.js 16 App Router, React 19, TypeScript strict, Prisma 6 + Postgres (Supabase), NextAuth v5 beta, Tailwind v4, FullCalendar, **docxtemplater + PizZip**, **exceljs**, **LibreOffice headless** (server-side DOCX→PDF), signature_pad, node-cron, bcryptjs, zod, recharts, sonner.

## Build phases

Execute in this order. Don't move to the next phase until the current one is solid.

### Phase 0 — Read everything (no code yet)
1. Read `/reference-material/PRD.md` end to end
2. List every file in `/reference-material/formats/` and run a quick parse on each (use `docxtemplater`-style parsing for DOCX, `exceljs` for XLSX, just to confirm structure matches PRD §6.1)
3. Read `/reference-material/legacy-codebase/prisma/schema.prisma` and `src/lib/permissions.ts` and `src/app/dashboard/layout.tsx` — these are the three legacy files closest to the new design
4. Write `PROGRESS.md` at repo root with your understanding of: the 5 journeys, the role matrix, and the format files. If anything is unclear in your understanding, **stop and re-read the PRD** rather than ask the user.

### Phase 1 — Schema + auth + templates
1. `prisma/schema.prisma` per PRD §5 (verbatim — copy the schema block from PRD)
2. `prisma db push` to a local Postgres (or Supabase if env vars set)
3. NextAuth v5 credentials provider, JWT sessions, role on session.user
4. `src/lib/permissions.ts` per PRD §3.1 (role × permission matrix)
5. `src/lib/audit.ts` — `createAuditLog`, `computeChanges` helpers
6. Set up `templates/` directory at repo root. Copy the format DOCX/XLSX files from `/reference-material/formats/` into `templates/` and add `{{placeholder}}` markers per PRD §6.1. Document what placeholders each template expects in `templates/README.md`.
7. `src/lib/templates/` with two files:
   - `docx.ts` — `renderDocxTemplate(templateName, data)` returns Buffer, optional `convertToPdf` to render via LibreOffice subprocess
   - `xlsx.ts` — `renderInvoice(flavor: 'services'|'products'|'manual', data)` returns XLSX Buffer
8. Seed script populating Centre, Departments, Services (parsed from MBD Master Data XLSX), Products, Staff, sample data per PRD §9
9. Commit. Run the seed. Run `prisma studio` and visually verify 60 services, 13 products, 21 staff, 1 dev user.

### Phase 2 — Journey A (Walk-in intake)
Build the entire walk-in journey end-to-end before anything else.
1. `/dashboard/intake` — FO generates QR. POST to `/api/intake-token` creates token.
2. `/intake/[token]` — patient form (2 pages: demographics + reasons + consent). On submit, creates Client (DRAFT) + IntakeForm.
3. `/dashboard/assign` — FO sees pending intakes, assigns therapists, captures customer-type + referral source. **Renders the prefilled DOCX consent form** for the patient to sign. Two paths: physical-scan upload OR signature-pad. Marks Client as ACTIVE.
4. `/dashboard/calendar` — books an appointment for the assigned therapist. FullCalendar drag-to-create. Clash detection. On create, fires Notification to therapist.
5. **Acceptance test**: a fresh clinic admin can: generate a QR → patient on phone fills the form → FO assigns Devanshi → FO uploads consent → FO books a 9am Tuesday slot → therapist Devanshi sees the patient in their dashboard. No errors. Audit log entries for: token-create, client-create, intake-submit, assignment-create, consent-upload, appointment-create.

### Phase 3 — Journey B (Returning patient → consultation → package → invoice)
1. `/dashboard/patients/[id]` — overview tab
2. `/dashboard/patients/[id]/clinical` — clinical record. Routes to template based on therapist's `Staff.departmentId`. Templates: Physician, Physiotherapy, Counselling, Yoga, Nutrition, FAB. Massage = no clinical record (per PRD).
3. Each template: form fields match the DOCX exactly. On save, creates Consultation row with formData JSON. PDF generation via docxtemplater. Append-only after status=COMPLETED.
4. From Consultation, FO can spawn a Package (with recommended sessions × billable services) → spawns an Invoice (Services flavor) → renders XLSX via exceljs.
5. Payment recording at `/dashboard/billing/payments`. Mode dropdown only (no live integration).
6. **Acceptance test**: existing patient comes in for second visit → therapist fills follow-up form → therapist recommends 6 more sessions of "Physiotherapy Session (Senior Physiotherapist)" → FO creates package → FO creates invoice (Services) → invoice numbering correct (`COL-MBD/0001/001-2026`) → MIS entry created → patient pays cash → invoice marked PAID → MIS entry's paidAmount updated.

### Phase 4 — Journeys C, D, E (therapist daily, FO daily, owner overview)
1. Therapist dashboard with today's appointments + assigned patients + change-request creator
2. FO dashboard with pending intakes + unpaid invoices + low-stock alerts + change-request reviewer
3. Owner dashboard + all 5 reports (MIS, staff productivity, defaulters, by-source, cancellations)
4. Admin pages: clinics, staff, services, products+inventory, promotions, referral sources, audit log, flags, change requests
5. Cron jobs: package-expiry, low-stock, follow-up-due → emit Alerts and Notifications

### Phase 5 — Polish
1. Global Cmd+K search across patients, invoices, appointments
2. Notification bell with unread count
3. Centre switcher in header (for multi-clinic; only one centre seeded but the UI should work)
4. Profile page: change password, upload signature image
5. Empty states for every list view (no patients yet → friendly empty state with CTA)
6. Loading skeletons via `<Skeleton />` for every async list

### Phase 6 — Acceptance pass
1. Walk every page as every role. Anything broken or 404 → fix.
2. Walk every journey from PRD §4 end-to-end. Any break → fix.
3. Run lint + build. Both must pass.
4. Update `README.md` with run instructions and the architectural decisions doc.

## Working style

- **Commit after each phase.** Use conventional commits.
- **Keep `PROGRESS.md` updated** at repo root with what's done, what's next, what's blocked.
- **One concern per file.** No 1700-line monolith pages.
- **Server actions for mutations** where they make sense (App Router pattern). Or API routes — pick one and stay consistent.
- **`useApiCache` hook from legacy is good.** Bring it over.
- **Prisma client singleton** at `src/lib/prisma.ts`. Use it everywhere.

## When you get stuck

- Re-read the PRD section relevant to your current task
- Check the legacy codebase for how it solved this — but never copy a parallel implementation, pick one and run it through
- If the user has given conflicting instructions in legacy comments vs PRD — PRD wins, every time

## What "done" looks like

- `npm run dev` shows a working multi-clinic SaaS
- Seed data fills it with realistic content
- Marazban can log in, see his data, navigate without dead-end clicks, generate format-faithful invoices, and view real reports
- Yasir can log in, see clinical records he authored, request changes
- A therapist can log in, see only their patients, fill forms in their modality
- An FO can run a full day: intake → assign → consent → book → invoice → payment
- Audit log shows every action
- Build is clean. No TypeScript errors. No dead code. No "Coming Soon" stubs.

Begin with Phase 0. Don't skip ahead.
