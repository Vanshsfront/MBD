# Claude Code Bootstrap Prompt — Movement By Design Clinic OS (Merged Build)

> Paste this as your first message in Claude Code, in a fresh repo. The repo should already have `/reference/` populated per the setup notes at the bottom of this file.

---

## Your job

Build a production-ready clinic operating system for Movement By Design (MBD), a multi-modality wellness clinic in Mumbai, India.

This is **not a from-scratch build**. There are two prior attempts:

| Repo | What's good | What's broken |
|---|---|---|
| **OG** at `/reference/og-codebase/` | Backend is solid: schema works, Prisma + NextAuth + RBAC + audit-log proven, `docxtemplater`/LibreOffice pipeline verified rendering PDFs from the actual DOCX templates | UI/UX is rough; greeting bug; silent redirect for unassigned-patient access |
| **Clinic 2** at `/reference/clinic2-codebase/` | UI is significantly better — design tokens, layouts, navigation | Functional state is poor: intake forms incomplete vs source DOCX, invoices wrong format, packages broken, role gates inconsistent, audit incomplete, therapist flow not solid |

**Merge strategy: OG is the base. Port clinic 2's UI layer onto OG's backend. Fix every issue from the audit files.**

Read in this order before writing any code:
1. `/reference/PRD.md` — the locked spec
2. `/reference/audits/` — what each build got right and wrong (4 files)
3. `/reference/mbd-punchlist.txt` — 12 specific things to fix
4. `/reference/og-codebase/` — your backend reference
5. `/reference/clinic2-codebase/` — your UI reference
6. `/reference/forms/` — the literal DOCX/XLSX templates the system fills

If anything conflicts, the order of authority is: **PRD > punchlist > audits > OG backend > Clinic 2 UI.**

---

## Inviolable rules

1. **Templates are literal.** All clinical forms (`.docx` in `/reference/forms/`) are filled with `docxtemplater`. All invoices (`.xlsx` in `/reference/forms/`) are filled with `exceljs`. **Never** redraw them in jsPDF, react-pdf, or HTML-to-PDF. Copy them into a `/templates/` folder in the new repo, mark placeholders, and fill. OG's pipeline already works — port it verbatim.

2. **Three-term vocabulary in code.** Never use bare "service" in schema or UI. Use:
   - `serviceCategory` — the department the patient picks at intake (Physio, Massage, Yoga, etc.)
   - `billableService` — the specific line item ("Sports Massage 60min", "Personal Coaching Duo") with HSN, price, GST
   - `treatmentProtocol` — what the therapist actually did in-session (cupping, taping, modalities)

3. **FO assigns therapist. Therapist picks billableService. Hard rule.** No FO-side service picker on the assignment screen. Confirmed in `mbd-punchlist.txt`.

4. **Every mutation writes an audit log.** Centralize in `src/lib/audit.ts`. Cover: Client, Invoice, Payment, Session, Consultation, Package, Staff, Service, Promotion, **InventoryItem, InventoryLog, ClientFlag, Centre, Appointment, ChangeRequest**. The punchlist explicitly calls out "admin should have audit trail for everything (things like stock being added)."

5. **No half-finished features.** "Coming in Phase 2" placeholders don't exist. If something is out-of-scope (see §11), don't put it in the nav. If it's in scope, finish it.

6. **No dead code, no parallel architectures, no redirect-only routes.** Delete what you don't use. One clinical-form architecture. One invoice generator. One auth flow.

7. **Strict TypeScript.** No `any` without an inline justification. No `@ts-ignore`. No `// TODO` left in committed code.

8. **Don't touch Razorpay/WhatsApp/DocuSign integrations.** Build the manual-entry flows and leave clean extension points (interface boundaries, dropdown options, optional fields) so they can be added later without ripping out the surrounding code. See §10.

---

## Stack (locked)

- Next.js 16 App Router, React 19, TypeScript strict
- Prisma 6 + PostgreSQL (self-hosted on VPS — see Deployment section)
- NextAuth v5 (credentials provider, JWT sessions, middleware-based route guards — port from OG)
- Tailwind v4 + shadcn-style components
- **docxtemplater + pizzip + docxtemplater-image-module-free** (signatures embed as images)
- **exceljs** for invoice XLSX rendering
- **LibreOffice headless** for DOCX → PDF (server-side subprocess)
- **FullCalendar** for scheduling
- **signature_pad** for consent capture
- **node-cron** for daily alert jobs
- **bcryptjs**, **zod**, **recharts**, **sonner**

**Do NOT install:** jsPDF (banned), react-pdf, Razorpay SDK, WhatsApp SDKs, DocuSign SDK, Prisma Accelerate. These are explicit no-gos for this build.

---

## Schema — based on OG's, with these locked fixes

OG's `schema.prisma` is the starting point. Make these specific changes:

### Required schema changes (apply these in Phase 1)

1. **`ClientDoctorAssignment` unique constraint is wrong.** Currently `@@unique([clientId, staffId])` — this breaks re-assignment over time. Replace with:
   - Remove `@@unique([clientId, staffId])`
   - Add `@@index([clientId, staffId, endedAt])`
   - Enforce in app code: when creating a new assignment for a (clientId, staffId) pair, check no existing record has `endedAt IS NULL`. If one exists, reject with a clear error or update the existing one.

2. **`InventoryItem` needs multi-clinic + supplier + selling price split.** Add:
   ```prisma
   centreId      String?
   centre        Centre?  @relation(fields: [centreId], references: [id])
   supplierName  String?
   supplyPrice   Float    @default(0)  // What we pay
   sellingPrice  Float    @default(0)  // What we charge — keep unitPrice as alias for back-compat or rename to sellingPrice
   priceHistory  InventoryPriceHistory[]
   ```
   Make `unitPrice` the same as `sellingPrice` going forward. Add to `Centre`:
   ```prisma
   inventoryItems InventoryItem[]
   ```
   Add the new model:
   ```prisma
   model InventoryPriceHistory {
     id              String   @id @default(cuid())
     inventoryItemId String
     inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id])
     supplierName    String?
     supplyPrice     Float
     sellingPrice    Float
     effectiveFrom   DateTime @default(now())
     changedById     String?
   }
   ```

3. **`InventoryLog` needs traceability fields:**
   ```prisma
   sessionId  String?
   invoiceId  String?
   centreId   String?
   ```
   So we can answer "what stock got used in this session" and "what stock got sold in this invoice."

4. **`Centre` needs full address + tax fields for invoice rendering:**
   ```prisma
   address           String?  // JSON: { line1, line2, city, pincode }
   contactPhone      String?
   gstNumber         String?
   panNumber         String?
   bankName          String?
   bankAccountNumber String?
   bankIfsc          String?
   bankBranch        String?
   ```
   The seed for the Colaba clinic should populate these from the actual values in the invoice DOCX templates (GST: `27AAYFM1598H1ZH`, PAN: `AAYFM1598H`, IFSC: `HDFC0000085`, Account: `50200023191570`, Branch: COLABA).

5. **`InvoiceCounter`** for atomic invoice numbering:
   ```prisma
   model InvoiceCounter {
     id            String  @id @default(cuid())
     centreId      String
     centre        Centre  @relation(fields: [centreId], references: [id])
     financialYear String  // "2026-2027"
     lastSequence  Int     @default(0)
     @@unique([centreId, financialYear])
   }
   ```
   Add `invoiceCounters InvoiceCounter[]` to `Centre`.

6. **`Service` gets a `serviceType` field** for MIS Type column:
   ```prisma
   serviceType String @default("CLINIC")  // CLINIC | GYM | ONLINE | HOME_VISIT
   ```

7. **`MisEntry` gets a `type` field** to match the client's MIS Sheet2 summary:
   ```prisma
   type String @default("Clinic")  // Clinic | Gym | Online | HomeVisit | Product
   ```
   Populated from the related service's `serviceType` or "Product" if it's a product line.

8. **`Staff.role` enum:** drop `MANAGER` from the comment list. Six roles only: `OWNER | ADMIN | FRONT_OFFICE | CONSULTANT | THERAPIST | DEV`. Update the seed and `permissions.ts` accordingly.

9. **`IntakeForm.assignedTo`/`assignedBy`/`frontOfficeExec`:** these are currently strings. Leave as-is for the form snapshot, but the authoritative assignment data lives in `ClientDoctorAssignment` rows. The strings are denormalized for PDF rendering only.

10. **`InventoryItem` rename `unitPrice` → keep both `unitPrice` and `sellingPrice` for one release** to avoid breaking the OG payment/invoice code that may reference unitPrice. Then deprecate `unitPrice` in code comments.

### What NOT to change

- Don't touch the `MisEntry` snapshot pattern — it works.
- Don't touch `Consultation.isLocked` / `lockedAt` — the append-only logic is correct.
- Don't drop `Appointment.followUpFlag`, `queuePosition`, `backupStartTime/EndTime` — these may not have UI yet but the OG audit didn't flag them as broken; surface them in the calendar.

---

## RBAC matrix (LOCKED — port from PRD §3)

| Permission | OWNER | ADMIN | FO | CONSULTANT | THERAPIST | DEV |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Generate intake QR | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| View patients (all) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| View patients (own assignments) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assign therapist + save consent | ✅ | ❌ | **✅** | ❌ | ❌ | ✅ |
| Edit clinical record (own assignments, not locked) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| View all clinical records read-only | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Book/reschedule/cancel appointment | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Request appointment change | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Review change request | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Create/edit invoices | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Record payments | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| View reports | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Export CSV | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage staff | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Manage clinics (add/edit/delete) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage services & rates | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Manage products / inventory | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Manage promotions | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Audit log view | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Client flags (create/edit) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

**Critical bug fix from `mbd-punchlist.txt` #1**: FO has explicit permission to **save and continue at the consent step on the assignment queue**. OG's permission file may have this wrong. Verify both API-level and UI-level.

**Locked decision from OG audit**: when a therapist clicks a patient on their calendar but has no active `ClientDoctorAssignment`, **show a modal**: "Access blocked: You must be assigned to this patient via the Front Office assignment queue to open their records. Ask the FO to assign you, then refresh." Don't silently redirect.

**Locked decision**: unassigned therapists do NOT see other therapists' patients. Owner/Admin can read everything.

---

## The 5 user journeys (LOCKED — every feature must belong to one)

### Journey A — Walk-in / new intake
FO clicks "New Intake" → generates QR/link → patient fills 2-page form on their phone → FO reviews, picks customer type (Walk-in / Referral / Booking), selects referral source, assigns one or more therapists → system renders prefilled consent DOCX → consent captured (digital pad OR upload of signed scan) → FO books an appointment for one of the assigned therapists → therapist gets a notification.

### Journey B — Returning patient session
FO checks patient in on calendar → therapist opens patient's clinical record → fills consultation (first visit) or follow-up (subsequent) form for their modality → optionally recommends services + #sessions → FO creates a Package + Invoice from the recommendations → FO records payment → MIS entry written.

### Journey C — Therapist daily
Therapist logs in → sees today's appointments + their assigned patients + pending follow-ups → opens clinical record → fills/edits (own assignments, not-yet-locked) → generates PDF → records inventory consumed in session → raises change requests for reschedules they can't do themselves.

### Journey D — Front office daily
FO sees pending intakes, today's bookings, unpaid invoices, change requests, low-stock alerts → handles intake → does assignments → manages calendar (book/reschedule with full validation) → generates invoices (Services / Products / Manual) → records payments → manages inventory stock → reviews therapist change requests.

### Journey E — Owner / Admin
Sees revenue overview → drills into MIS (31-column table) → staff productivity (with cancellation split) → defaulters → revenue by referral source → cancellation analysis → audit log → admin CRUD for clinics, staff, services, products, promotions, flags, referral sources, change requests.

**If a screen doesn't fit a journey, delete it.**

---

## Punchlist (`mbd-punchlist.txt`) — all 12 are blockers

1. **FO permission to save+continue at consent step on assignment queue** — fix permission gate + API.
2. **Digital signature disclaimer copy** — change to: *"Digital signature is for record-keeping. For legally binding e-signatures, we recommend integrating an audit-trailed provider — to be configured later."* Keep the feature (iPad signing OR scan upload). Both paths supported.
3. **FO does not assign service. Therapist does.** No "Service" picker on the assignment queue. Therapist picks `billableService` during/after consultation.
4. **Multiple therapists per patient at intake.** UI must show "Add additional therapist / area" button — not just one dropdown. Each row gets its own `ClientDoctorAssignment`. First one is `isPrimary = true` by default.
5. **Recents tab for invoicing.** When FO is building an invoice for a patient, the line-item picker has three tabs:
   - **Recent** (default) — last 10 `billableService` IDs delivered or recommended to *this patient*, sorted most-recent-first
   - **All services** — full master service list (60 services), grouped by department
   - **Products** — full product master (13 SKUs from the inventory)
   Plus a search box that searches across all three.
6. **Packages are broken — fix.** Package detail screen must show: patient name, package name (e.g. "Physio 10-session"), `serviceMix` rendered as readable lines ("8× Physiotherapy Session (Senior Physiotherapist), 2× K-Taping"), validFrom/validUntil, status, completedSessions / totalSessions with progress bar, totalPrice, discount, linked invoices, linked sessions table (date, therapist, status, notes). Creating a package from a consultation's `recommendedSessions` must work end-to-end.
7. **Audit trail covers everything** including `InventoryItem` add/edit, `InventoryLog` create, `Centre` add, `Service` add/edit, `Promotion` add/edit, `ClientFlag` add/edit. See §6.4.
8. **Client flags surfaced in UX.** Render flag badges (color-coded) on:
   - Patient cards in the patients list
   - Patient detail header
   - Calendar event tooltips
   - Assignment queue rows
   - Invoice patient field
   Build a flag manager in patient detail: add/edit/deactivate flags with type, label, color, notes.
9. **Validate reschedule.** When FO drags an appointment to a new slot OR opens a reschedule modal, validate:
   - New start time is in the future (not in the past)
   - Therapist is active and not on leave
   - New slot doesn't clash with any existing CONFIRMED appointment for that therapist
   - New slot is within configured working hours (default 08:00–20:00, configurable per centre via env or settings)
   - If patient has another appointment within ±15 minutes of the new slot, warn (don't block)
   Show specific error per failed check, not a generic "couldn't reschedule."
10. **Therapist flow rock solid.** Acceptance test: a therapist logs in and can: see today's appointments, click a patient (only if assigned), see prior consultation history (their own only), fill a first-consult OR follow-up form (system decides based on whether prior consultation exists for the same `serviceCategory`), save it as draft and resume, lock it as completed, generate the PDF download, record inventory consumed, raise a reschedule request, change their password, upload a signature image. No 404s, no silent redirects, no broken transitions.
11. **Forms match DOCX 1:1.** Every field in the source DOCX (in `/reference/forms/`) exists in the digital form. Use docxtemplater to fill the actual DOCX on PDF generation. **The forms folder is the source of truth for which fields exist.** Specifically (verify field-by-field):
    - `COMMON PATIENT INTAKE FORM.docx` — patient demographics + visit reasons (8 categories) + consent + clinic policies + signature fields + FO fields
    - `PHYSICIAN CONSULTATION.docx` — vitals (Wt/Ht/BMI/SpO2/PR/BP) + comorbidities (DM/HTN/CAD/PCOS/Thyroid/Other) + allergies + complaints + PMH/PSH/FH/personal hx + sleep/diet/bowel + diagnosis + meds + plan + follow-up + signature
    - `PHYSIOTHERAPY CONSULTATION.docx` — Physician's fields + occupation + sport + structured pain history table (Site/Side/Onset/Duration/Frequency/Intensity/Aggravating/Relieving) + 10 examination tables (Posture, Soft Tissue, Girth, Tightness, ROM, MMT, Neuro, DTR, Gait, Functional, Special Tests)
    - `FUNCTIONAL ASSESSMENT BATTERY.pdf` — medical/injury screening + training history + sleep/stress/PA + the 14-component pre/post-test table (HR, BP, SpO2, Ht, Wt, BMI, Limb Length, Sit&Reach, Back Scratch, Ankle DF, Push-ups, Squats, Plank, 2-min step, YMCA step, Sprint, Vertical Jump, T-Test, Ruler Drop, Y-Balance)
    - `COUNSELLING INTAKE FORM.pdf` — reason for counselling + medical hx + mental health hx + substance use + goals + consent
    - `WELLNESS YOGA INTAKE FORM.pdf` — medical hx + physical activity + yoga experience + goals + preferred session type (1:1 / Duo / Trio) + consent
    - Each follow-up sheet — header + repeating session-row table (use docxtemplater loop syntax for the rows)
    
    Map therapist department → form:
    - **Medical / Consultant** → Physician Consultation (first) + Physician Follow-up (subsequent)
    - **Physiotherapy** → Physiotherapy Consultation + Physiotherapy Follow-up
    - **Massage** → NO clinical template (transactional). Skip clinical record screen entirely for this dept.
    - **Yoga** → Wellness Yoga Intake (first) + Wellness Yoga Follow-up (subsequent)
    - **Counselling** → Counselling Intake (first) + Counselling Follow-up (subsequent)
    - **Nutrition** → use Physician Consultation template adapted (no dedicated DOCX for first-visit nutrition exists) + Nutrition Counselling Follow-up
    - **S&C** → Functional Assessment Battery (first + reassessment) + S&C Follow-up (sessions)

12. **Proper credentials for everyone.** Seed must produce a working login per role and per modality. See §8 Seed Data.

---

## Critical implementation rules

### 6.1 Format-driven document generation (port OG's pipeline)

OG already has a working pipeline at `src/lib/templates/docx.ts`. Port it verbatim. Key elements:

- Templates copied from `/reference/forms/` into the new repo's `/templates/` directory at build time
- Placeholder syntax: `{{patient.name}}`, `{{vitals.bp}}`, etc.
- Repeating rows in follow-up sheets use docxtemplater's loop syntax: `{#sessions}...{/sessions}`
- Signatures embed via `docxtemplater-image-module-free` as base64 PNG
- DOCX → PDF via `libreoffice --headless --convert-to pdf` subprocess
- Env var `SOFFICE_BIN` points to soffice binary path
- **All clinical PDFs and all invoices go through this pipeline. No jsPDF anywhere.**

For invoice rendering, use the same approach but with `exceljs` reading the XLSX templates from `/reference/forms/` (Services / Products / Manual / Proforma flavors). Fill rows 28-53 (line items), header fields, totals.

### 6.2 Invoice numbering

Format: **`{centreSlug}/{seq:0000}/{monthCounter:000}-{yyyy}`**

Example: `COL-MBD/0001/426-2026`

Implementation:
- `seq` from `InvoiceCounter` table, atomic upsert+increment by (centreId, financialYear). FY = Apr 1 → Mar 31.
- `monthCounter` = count of invoices in current calendar month for this centre + 1, 3-digit padded.
- `yyyy` = current calendar year.

### 6.3 Discount + promo stacking

**Order: line discount FIRST, promo SECOND.**

Per invoice:
1. Each line item: `lineSubtotal = perAmount × qty`. Apply `lineDiscount` percent.
2. Sum to invoice subtotal.
3. Apply promo (if any) to invoice subtotal.
4. Compute GST on each line's post-discount, post-promo amount, using each service's gstRate.

Lock the math in `src/lib/billing.ts` with unit-testable functions.

### 6.4 Duo/Trio quantity lock

When line item is a service with `participantCount > 1`, the qty field is **disabled** and forced to `participantCount`. Show tooltip: "Auto-set to 2 for Duo / 3 for Trio."

### 6.5 Consent signature (two paths, both supported)

- **DIGITAL_PAD**: signature_pad on tablet, save PNG base64 to `IntakeForm.signatureDataUrl`, embed in DOCX via docxtemplater-image-module
- **PHYSICAL_SCAN**: FO downloads prefilled DOCX, prints, patient signs, FO uploads scan/photo back. URL stored at `Client.consentFormPhotoUrl`

`IntakeForm.consentMethod` tracks which path was used. Display the disclaimer copy from punchlist #2.

### 6.6 Therapist-service scoping

- FO assignment dropdown: shows only staff in departments matching the patient's `IntakeForm.selectedCategories`
- Therapist clinical screen: service dropdown shows only services in that therapist's `Staff.departmentId`
- Invoice line-item picker: no scoping — FO sees everything

### 6.7 Cancellation tracking

`Appointment.cancelledBy ∈ {PATIENT, THERAPIST, CLINIC}`. The cancel dialog has a required radio for this. Reports must split by it.

### 6.8 Multi-clinic

- `Centre` is the unit. Every transactional record carries `centreId`.
- Header has a centre switcher dropdown (visible to Owner; defaults to user's `Staff.centreId` for everyone else).
- `Admin → Clinics` has full CRUD (Owner only). Create flow includes "Copy services from existing clinic" checkbox + dropdown.
- Adding a clinic does NOT copy staff or inventory by default. Each clinic's stock is independent.
- Reports filter by centre by default. "All centres" option for Owner.

### 6.9 Inventory CRUD

Full CRUD at `/dashboard/admin/inventory`. Fields:
- Name, SKU, category, HSN/SAC, GST rate
- Per-centre stock + minStock
- Supplier name, supplyPrice, sellingPrice
- "Update price" button writes a new `InventoryPriceHistory` row + updates current values
- Stock adjustment modal: type (Stock In / Stock Out / Adjust), qty, notes → writes `InventoryLog`
- Low-stock alert auto-generates when `stock <= minStock`

Inventory consumption in sessions: therapist clinical screen has an "Inventory used in this session" multiselect → writes `InventoryLog{action:USED, sessionId}` and decrements stock.

Inventory sold via invoice: Products invoice flavor — line items pull from `InventoryItem`, on save writes `InventoryLog{action:SOLD, invoiceId}` and decrements stock.

### 6.10 Audit log (every mutation)

Centralize in `src/lib/audit.ts`:
- `createAuditLog({ action, entity, entityId, changes, metadata, performedById })`
- `computeChanges(old, new)` returns `{ field: { old, new } }` skipping `id`, `createdAt`, `updatedAt`, `passwordHash`, large blobs

Wire it into:
- All Client mutations
- All Invoice mutations
- All Payment creates
- All Session creates/updates
- All Consultation locks/saves
- All Package mutations
- All Staff mutations
- All Service mutations
- All Promotion mutations
- All InventoryItem mutations
- All InventoryLog creates
- All ClientFlag mutations
- All Centre mutations
- All Appointment mutations (including reschedule + cancel)
- All ChangeRequest reviews

Audit log viewer at `/dashboard/admin/audit` with filters: entity, performer, date range, action. Pagination.

### 6.11 Notifications

In-app only (no email/SMS yet). `Notification` model already exists. Trigger on:
- New patient assigned to a therapist (from Journey A)
- Appointment created/rescheduled/cancelled affecting a therapist
- Change request submitted (notify FO + Owner)
- Change request reviewed (notify requester)
- Low stock (notify FO + Admin + Owner)
- Package about to expire (notify FO + assigned therapists)
- Unpaid invoice past due (notify FO + Owner)

Bell icon in header with unread count. Click opens dropdown showing latest 20.

### 6.12 Cron jobs

`node-cron` runs three jobs daily at **02:00 IST**:
- **Package expiry sweep**: any package where `validUntil - today <= expiryWarningDays` → create Alert + Notification
- **Low stock sweep**: any `InventoryItem` where `stock <= minStock` → create Alert + Notification (deduplicate so we don't spam daily)
- **Follow-up due sweep**: any session with `Consultation.followUp` text containing a parseable date that's within 7 days → create Alert

Env flag `DISABLE_CRON=true` skips registration (for dev/testing).

### 6.13 Cmd+K global search

Headless keyboard shortcut opens a Spotlight-style modal. Indexed entities:
- Clients (name, phone, clientCode) — all roles with patient access
- Invoices (invoiceNumber, client name) — roles with invoice access
- Appointments (client name, date) — roles with calendar access
- Staff (name, role) — Admin/Owner only
- Services (name) — Admin/Owner only

Each result shows entity type badge + click navigates to its detail page. Debounced query, server-side search.

### 6.14 Greeting bug fix

The "Welcome, Dr. Dr. Devanshi" / "Welcome, Dr." bug from OG audit:
- Stop splitting names. Store `Staff.name` as the full display name including any prefix.
- Greeting uses the full `name` directly — no parsing.
- If you want "first name only" display, store `Staff.displayName` as a separate optional field, settable per user in their profile.

---

## 7. Routing & nav

```
/                                       → redirect to /login or /dashboard
/login
/intake/[token]                         → public patient intake (QR landing)
/portal/[token]                         → public client portal (read-only)
/dashboard                              → role-aware overview
/dashboard/intake                       → FO: generate QR + pending intakes
/dashboard/assign                       → FO: assignment queue
/dashboard/patients
/dashboard/patients/[id]                → patient overview
/dashboard/patients/[id]/clinical       → clinical record (template routed by therapist dept)
/dashboard/patients/[id]/packages
/dashboard/patients/[id]/invoices
/dashboard/patients/[id]/flags          → client flag manager
/dashboard/calendar
/dashboard/sessions
/dashboard/billing/invoices
/dashboard/billing/invoices/new
/dashboard/billing/invoices/[id]
/dashboard/billing/payments
/dashboard/billing/packages
/dashboard/reports
/dashboard/reports/mis
/dashboard/reports/staff
/dashboard/reports/defaulters
/dashboard/reports/sources
/dashboard/reports/cancellations
/dashboard/admin
/dashboard/admin/clinics                → Owner only
/dashboard/admin/staff
/dashboard/admin/services
/dashboard/admin/inventory              → full CRUD
/dashboard/admin/promotions
/dashboard/admin/referral-sources
/dashboard/admin/audit
/dashboard/admin/change-requests
/dashboard/settings/profile
```

Nav source-of-truth: `src/lib/nav.ts` per role. Anything outside whitelist returns 404, not a redirect.

**Delete entirely**: any redirect-only routes inherited from either codebase, `/dashboard/front-office/*`, `/dashboard/consultation` standalone, parallel `/dashboard/clinical/*` if present.

---

## 8. Seed data + demo flow

Single seed script at `prisma/seed.ts`. Idempotent (safe to re-run).

### Static reference data
- 1 Centre: `COL-MBD` "Movement By Design — Colaba" with full address/GST/PAN/bank fields
- 7 Departments: Medical, Physiotherapy, Massage, Yoga, Counselling, Nutrition, S&C
- 60 Services parsed from `/reference/forms/MBD Master Data.xlsx` → ServicesMasterData sheet
- 13 Products in InventoryItem (parsed from ProductMasterData sheet) with stock = 50, minStock = 10 each
- 5 Referral Sources: Google, Instagram, Friend, Doctor referral, Walk-in
- 5 Promotions: SENIOR5, FORCES10, FESTIVAL15, WELCOME5, REFERRAL10

### Staff (per role + per modality)
Default password `mbd2026` for all (hash with bcrypt). Force change on first login in prod.

| Role | Email | Name | Department |
|---|---|---|---|
| OWNER | `marazban@mbd.in` | Marazban Doctor | — |
| ADMIN | `yasir@mbd.in` | Dr. Yasir Zahid (PT) | Physiotherapy |
| FRONT_OFFICE | `ramchandra@mbd.in` | Ramchandra | — |
| FRONT_OFFICE | `lata@mbd.in` | Lata | — |
| CONSULTANT | `prerna@mbd.in` | Dr. Prerna Chhugani | Medical |
| THERAPIST | `devanshi@mbd.in` | Dr. Devanshi Vira (PT) | Physiotherapy |
| THERAPIST | `tasneem@mbd.in` | Dr. Tasneem Ansari (PT) | Physiotherapy |
| THERAPIST | `sanya@mbd.in` | Dr. Sanya Jain (PT) | Physiotherapy |
| THERAPIST | `sanjay@mbd.in` | Sanjay More | Massage |
| THERAPIST | `dipali@mbd.in` | Dipali Sawant | Massage |
| THERAPIST | `naina@mbd.in` | Naina Daryanani | Yoga |
| THERAPIST | `shivli@mbd.in` | Shivli Malani | Yoga |
| THERAPIST | `disha@mbd.in` | Disha Chandan | Counselling |
| THERAPIST | `shruti@mbd.in` | Shruti Vibhakar | Counselling |
| THERAPIST | `sheetal@mbd.in` | Sheetal Somaiya | Nutrition |
| THERAPIST | `rajal@mbd.in` | Rajal Shah | Nutrition |
| THERAPIST | `danesh@mbd.in` | Danesh Doctor | S&C |
| DEV | `dev@mbd.in` | Dev User | — |

### Demo flow patient (CRITICAL for testing)

Create one patient called **"Demo Patient — Walked Through"** with the entire happy-path pre-completed so QA can immediately verify every screen:
- Intake submitted (Common Patient Intake) with: Aanya Sharma, F, 32, phone, address, emergency contact, visit reasons = ["Physiotherapy", "Pain/Injury"]
- Consent uploaded (placeholder URL pointing to a sample image in `/public/demo/consent-sample.jpg`)
- Two `ClientDoctorAssignment` rows: primary = Dr. Devanshi (Physio), secondary = Sanjay More (Massage)
- One completed `Consultation` (Physiotherapy, with vitals + diagnosis + 8 recommended sessions)
- One `Package` (8 sessions, validFrom = today, validUntil = +90 days, totalPrice = ₹14,400)
- Three completed `Session` rows linked to the package (dates spread over past 2 weeks)
- One `Invoice` linked to the package (paid in full via UPI)
- One `Payment` record linked to that invoice
- One `MisEntry` row reflecting it all
- One `ClientFlag` (type=VIP, label="Long-time client", color=purple)

### Other realistic data
- 30 additional clients in various states (DRAFT / ACTIVE), mix of customer types and referral sources
- 100 appointments spread across this week ± 2 weeks (mix of CONFIRMED / COMPLETED / CANCELLED — including a few cancelled-by-patient and a few cancelled-by-therapist for the report split)
- 50 completed sessions for staff productivity reports
- 30 MIS entries
- 5 audit log entries
- 5 client flags across various patients
- 10 inventory log entries (mix of ADDED / USED)
- 3 change requests (1 PENDING, 1 APPROVED, 1 REJECTED)
- 5 notifications

After seed, anyone can log in as any role and see a fully-functioning app within seconds. The demo patient is the first row in any patient list — clearly labeled.

---

## 9. Build phases

Execute **strictly in order**. Don't move to next phase until current is acceptance-tested.

### Phase 0 — Read + plan (no code)
1. Read PRD, audits, punchlist, OG schema, OG `permissions.ts`, OG `templates/docx.ts`, OG `app/dashboard/layout.tsx`
2. Read clinic 2's `components/` and `app/dashboard/` for UI patterns
3. List every DOCX/XLSX in `/reference/forms/` and confirm placeholder coverage matches §6.11
4. Write `PROGRESS.md` at repo root with: understanding of all 5 journeys, the role matrix, what UI clinic 2 contributes, what backend OG contributes, ordered list of punchlist items mapped to phases

### Phase 1 — Schema + auth + audit + templates + seed
1. Port OG's `schema.prisma`, apply all 10 changes from §5
2. `prisma db push` to a local Postgres (Docker per OG's setup)
3. Port OG's NextAuth setup, middleware, `permissions.ts` — apply the FO consent fix
4. Port OG's `src/lib/audit.ts` — expand entity coverage
5. Port OG's `src/lib/templates/docx.ts` + LibreOffice integration
6. Copy DOCX/XLSX templates into `/templates/` and add placeholders per §6.11 spec
7. Build `src/lib/templates/xlsx.ts` for invoice rendering via exceljs
8. Write the seed per §8 (idempotent, includes the demo patient)
9. Acceptance: `npm run dev` shows login screen. Log in as each of the 7 demo accounts. Each lands on `/dashboard` without errors. Audit log shows your login events. `prisma studio` shows full seed data.

### Phase 2 — Journey A (intake → assign → consent → book)
1. `/dashboard/intake` — QR generator with token expiry, pending intake list
2. `/intake/[token]` — public 2-page patient form, every field from Common Patient Intake DOCX
3. `/dashboard/assign` — assignment queue with: customer type radio, referral source dropdown, multi-therapist picker ("+ Add additional therapist/area"), consent capture (digital pad OR upload), save+continue button (FO permitted!), generate consent PDF (prefilled DOCX) button
4. Calendar booking integrated — drag-to-create with full validation per §6 punchlist #9
5. Notification fires to therapist
6. **Acceptance**: Run the full journey for a new fake patient. Verify: Client row created, IntakeForm + IntakeToken rows correct, two `ClientDoctorAssignment` rows (both active, neither has endedAt), consent PDF downloads with all patient data filled, consent photo URL saved, appointment booked correctly, therapist's dashboard shows the new patient + the booking + the notification. All actions audit-logged.

### Phase 3 — Journey B (consult → package → invoice → payment)
1. `/dashboard/patients/[id]` — overview tab (UI from clinic 2)
2. `/dashboard/patients/[id]/clinical` — clinical record. Routes to template based on therapist's department. Loads first-consult OR follow-up based on prior consultations for the same dept. Append-only after lock.
3. Each template: fields match DOCX 1:1. Save draft. Lock as completed. Generate PDF via docxtemplater.
4. Therapist recommends services + #sessions on the consultation
5. FO creates Package from recommendations (preselected services and counts, editable)
6. FO creates Invoice (Services flavor) from the Package. Line picker has 3 tabs (Recent / All Services / Products) per punchlist #5. Discount + promo stacking per §6.3. Duo/Trio qty locked per §6.4. Invoice number format per §6.2.
7. FO records Payment. Invoice status auto-updates. MisEntry rows written at invoice creation, paymentAmount/balance updated when payment recorded.
8. **Acceptance**: Existing patient comes in for 2nd visit. Therapist opens clinical record → sees prior consultation summary → fills follow-up form → recommends 6 more sessions → FO creates package → creates invoice (Services) — verify invoice number is `COL-MBD/0002/{monthCounter}-2026` → records cash payment → MIS entry's paidAmount updated → patient packages page shows 6/6 remaining → PDF downloads byte-identical to source DOCX template structure.

### Phase 4 — Journeys C, D, E + reports + admin
1. Therapist dashboard: today's appointments, my patients, change request creator
2. FO dashboard: pending intakes, unpaid invoices, low-stock, change request reviewer, today's bookings
3. Owner dashboard: revenue (today/week/month/YTD), client count, staff utilization, outstanding dues
4. All 5 reports per Journey E
5. Admin CRUD: clinics (Owner-only with "copy services" option), staff, services, inventory, promotions, referral sources, audit log, flags, change requests
6. Cron jobs registered per §6.12
7. **Acceptance**: Walk every screen as every role. Every nav item works. Every list has empty states and pagination. Audit log captures every admin mutation including inventory.

### Phase 5 — Polish
1. Cmd+K global search per §6.13
2. Notification bell with unread count + dropdown
3. Centre switcher in header
4. Profile page (password change, signature image upload)
5. Loading skeletons for every async list
6. Empty states for every list
7. Error boundaries on every page
8. Toast notifications via sonner for every mutation

### Phase 6 — Acceptance + handoff
1. Run every journey end-to-end as every role
2. Verify all 12 punchlist items pass
3. `npm run build` — must succeed with zero errors
4. `npm run lint` — clean
5. Write `README.md` with: stack, run instructions, how to seed, how to add a clinic, where templates live, invoice numbering explanation, deployment to VPS
6. Write `HANDOFF.md` with: credentials for all roles, demo patient walkthrough, what's deployed, what's Phase 2 scope (per §10), known limitations

---

## 10. Out of scope (do NOT build, but leave extension points)

These are explicitly Phase 2. Don't build them, but the architecture should accommodate them:

- **Razorpay live integration** — Payment.method dropdown already has RAZORPAY; leave reference field for txn ID; build a no-op `src/lib/payments/razorpay.ts` stub that just records the manual payment for now. Future: replace stub with real SDK call.
- **WhatsApp Business API** — leave a `src/lib/notifications/channels.ts` interface with `sendInApp` (working) and `sendWhatsApp` (no-op stub). Notification model already has metadata for messages.
- **DocuSign / legally binding e-sign** — keep signature_pad image flow + scan upload. Add a comment in `IntakeForm.consentMethod` enum: `// DIGITAL_PAD | PHYSICAL_SCAN | DOCUSIGN (Phase 2)`
- **Salary auto-calculation** — staff productivity report shows raw counts and revenue. No incentive formula. Owner exports CSV and computes offline.
- **Email / SMS notifications** — in-app only.
- **AI receipt OCR** — explicitly killed by client.

For each Phase 2 item, the codebase must NOT have UI stubs saying "Coming soon." Either build it for real or omit it entirely from the user-visible surface.

---

## 11. Deployment

Target: **VPS-hosted Postgres + Node.js Next.js app**, both on the same VPS (single-box deployment) OR Postgres on a separate VPS in the same private network.

- `DATABASE_URL` env var points to Postgres (e.g. `postgres://user:pass@localhost:5432/mbd` for co-located, or private IP for separate)
- `DIRECT_URL` same as DATABASE_URL for single-box (Prisma's `directUrl` is only needed for connection-poolers like Accelerate or PgBouncer — **we are not using Accelerate**)
- LibreOffice installed on the VPS for PDF conversion; `SOFFICE_BIN` env var points to soffice binary
- File storage: local disk for now (consent photo uploads, signature images). Document the path as `UPLOAD_DIR` env var. Use `/var/lib/mbd/uploads/` as default.
- Process manager: PM2 or systemd; not specified, leave to deployment doc.
- HTTPS via Caddy or nginx reverse proxy with Let's Encrypt — deployment doc only, not build concern.

Include in `README.md`: a section "Deploying to a VPS" with step-by-step (install Node 20, Postgres 16, LibreOffice, clone, env, build, migrate, seed, run, reverse-proxy).

---

## 12. Definition of done

Build is done when:

1. All 5 user journeys execute end-to-end without dead screens
2. All 12 punchlist items pass acceptance tests
3. Every DOCX template in `/reference/forms/` is wired as a literal template → output is byte-faithful
4. Every XLSX invoice template is wired the same way
5. RBAC enforced at both API (`hasPermission`) and nav (whitelist) levels
6. Audit log captures every mutation listed in §6.10
7. Demo patient walkthrough works the moment you log in
8. Cmd+K, notifications, centre switcher all functional
9. Cron jobs registered and tested
10. Multi-clinic CRUD works (Owner can add a new clinic, scope flips, services copy)
11. Inventory full CRUD with price history, supplier, multi-clinic stock
12. `npm run build` and `npm run lint` clean
13. README + HANDOFF docs written

---

## Working principles

- **Commit after each phase** with conventional commit messages
- **Keep `PROGRESS.md` updated** with what's done, what's next, what's blocked
- **One concern per file.** No 1700-line monolith pages.
- **Server actions for mutations** (App Router pattern) OR API routes — pick one and stay consistent
- **No clarifying questions about scope.** PRD wins. If something genuinely isn't covered, default to the simplest interpretation that fits one of the 5 journeys, document the decision in `PROGRESS.md`, and move on.
- **The only legitimate questions** are: env/infra (Postgres URL, LibreOffice path), commit batching, or technical errors that block progress
- **When stuck**: re-read the PRD section relevant to your task, check both reference codebases for how they solved it, pick one and run it through cleanly

Begin with Phase 0. Don't skip ahead.

---

# Repo setup (one-time, before invoking Claude Code)

A standalone PowerShell script does this for you. It is **read-only** against your existing files — it copies FROM them and writes to a new isolated folder, never modifying anything you already have.

## Quick setup

1. Save the file `bootstrap-mbd.ps1` (provided alongside this prompt) anywhere convenient — Desktop is fine.
2. Right-click the file and choose **"Run with PowerShell"**.
3. The script will:
   - Create a new repo at `E:\WORK\GOATED\Medical\mbd-clinic-merged`
   - Copy the OG codebase, Clinic 2 codebase, forms folder, both audit folders, and `mbd.txt` into a `/reference` subfolder
   - Strip `node_modules`, `.next`, `.git`, build artifacts, and env files automatically
   - Auto-detect `PRD.md` and `MERGED_BUILD_PROMPT.md` if they're in your Downloads folder and copy them in too
   - Write a `CLAUDE.md` at the repo root that orients Claude Code
   - Make an initial git commit
4. If Windows blocks the script ("execution policy"), open PowerShell as Administrator once and run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   Then re-run the script.

The whole thing takes about 30 seconds. Source folders (`Archive (1)\mbd-clinic-os`, `clinic 2`, `forms`, `OG inputs`, `clinic 2 inputs`) are never touched.

## What ends up in the repo

```
E:\WORK\GOATED\Medical\mbd-clinic-merged\
├── CLAUDE.md                                  ← Claude Code reads this first
├── .gitignore
└── reference\
    ├── PRD.md
    ├── CLAUDE_CODE_PROMPT.md                  ← (this file, renamed)
    ├── mbd-punchlist.txt                      ← (was mbd.txt)
    ├── og-codebase\                           ← mbd-clinic-os, no node_modules
    ├── clinic2-codebase\                      ← clinic 2, no node_modules
    ├── forms\                                 ← DOCX/XLSX/PDF templates
    └── audits\                                ← both inputs folders merged
```

## Then invoke Claude Code

Open the new folder (`E:\WORK\GOATED\Medical\mbd-clinic-merged`) in Claude Code.

Your first message: **the entire contents of `reference/CLAUDE_CODE_PROMPT.md`** (this file).

Do not let Claude Code skip Phase 0. The reading pass is what prevents another disconnected build. After Phase 1 (schema + auth + audit + templates + seed), pause and manually verify before letting it continue.
