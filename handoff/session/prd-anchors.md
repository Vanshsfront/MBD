# PRD anchors — vocabulary, RBAC, journeys

The locked spec is at `reference/PRD.md` (~1100 lines). This is the distillation any Claude session needs to be useful in 5 minutes. Authority order: **PRD > punchlist > audits > OG backend > Clinic 2 UI**.

---

## Three-term vocabulary (NEVER use the bare word "service")

| Term | What it means | Who decides | When |
|---|---|---|---|
| **`serviceCategory`** | The clinical department the patient is interested in. One of: Medical, Physiotherapy, Massage, Yoga, Counselling, Nutrition, S&C, Pain/Injury, Wellness Consult | **Patient** | At intake form |
| **`billableService`** | A specific line item from the rate card (e.g. "Sports / Deep Tissue Massage (60 min)"). Has price, GST, HSN/SAC, participantCount | **Therapist** decides; **FO** records on invoice | After consultation |
| **`treatmentProtocol`** | What was actually done in a session — modality, exercises, taping, cupping | **Therapist** | During session |

Locked rule: **FO assigns therapist. Therapist decides services. Hard rule.** (April 28 client resolution; supersedes the April 4 / April 25 messages where the client said "FO selects service".)

---

## Role × permission matrix (PRD §3.1)

Six roles. No MANAGER (legacy artifact, dropped).

| Permission | OWNER | ADMIN | FO | CONSULTANT | THERAPIST | DEV |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Generate intake QR | ✓ | — | ✓ | — | — | ✓ |
| View patients (all) | ✓ | ✓ | ✓ | — | — | ✓ |
| View patients (own assignments) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit demographics | ✓ | — | ✓ | — | — | ✓ |
| Assign therapist + save consent | ✓ | — | **✓** | — | — | ✓ |
| Edit clinical record (own, not locked) | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Edit COMPLETED clinical record | ✓ | — | — | — | — | ✓ |
| Book / reschedule / cancel appointment | ✓ | ✓ | ✓ | — | — | ✓ |
| Request appointment change | — | — | — | ✓ | ✓ | ✓ |
| Review change request | ✓ | ✓ | ✓ | — | — | ✓ |
| View invoices | ✓ | ✓ | ✓ | — | — | ✓ |
| Create / edit invoices | ✓ | — | ✓ | — | — | ✓ |
| Record payments | ✓ | — | ✓ | — | — | ✓ |
| View reports / MIS | ✓ | ✓ | — | — | — | ✓ |
| Export CSV | ✓ | — | — | — | — | ✓ |
| Manage clinics | ✓ | — | — | — | — | ✓ |
| Manage staff / services | ✓ | ✓ | — | — | — | ✓ |
| Manage products / inventory | ✓ | ✓ | ✓ | — | — | ✓ |
| Audit log | ✓ | ✓ | — | — | — | ✓ |
| Client flags | ✓ | ✓ | ✓ | — | — | ✓ |

**Two contested decisions, locked:**
- **Q1: Can unassigned therapists view another therapist's patient records? → NO.** Therapists/Consultants only see patients they're actively assigned to. (Yasir said yes; Marazban Apr 17 said let-me-think; privacy-by-default wins.)
- **Q2: How does therapist switching affect record edit access?** When reassigned away, the old therapist drops to **view-only** on records they previously created. Cannot edit, even retrospectively. COMPLETED records are append-only — only OWNER can edit. (Apr 10 ruling.)

---

## The five user journeys (every screen belongs to one)

### A — Walk-in / new intake (FO drives)

1. **FO** clicks "New Intake" → generates QR (token, 60-min expiry)
2. **Patient** on their phone fills 2-page form: demographics + visit reasons + consent acknowledgements
3. **FO** reviews on `/dashboard/assign` → picks customer type (Walk-in / Referral / Booking), referral source, **one or more therapists** (★ marks primary)
4. **FO** captures consent — digital pad OR upload of signed scan
5. **FO** books a calendar slot for the assigned therapist
6. **System** notifies the therapist

### B — Returning patient session (FO + Therapist)

1. **FO** checks patient in on calendar
2. **Therapist** opens clinical record. System routes to first-visit form (no prior consultations for this dept) or follow-up form (otherwise)
3. **Therapist** fills the form (vitals, complaints, diagnosis, plan, etc.) and recommends `billableService`s + #sessions
4. **FO** creates a `Package` from the recommendations
5. **FO** creates an invoice (Services flavor by default). 3-tab line picker: Recent / All / Products
6. **FO** records payment. Invoice status auto-updates. MIS snapshot rows written

### C — Therapist daily

Login → today's appointments + assigned patients + pending follow-ups + low-stock alerts + notifications → click a patient (only if assigned) → fill consultation/follow-up → save draft / lock as completed → generate PDF → record inventory consumed → raise change requests for reschedules → profile (password + signature)

### D — Front office daily

Pending intakes → today's bookings → unpaid invoices → change-request review → low-stock → intake / assignment / calendar / billing / inventory

### E — Owner / Admin overview

Revenue overview → 31-col MIS table (date/centre/dept/consultant filters, CSV export) → staff productivity (cancellation split, no salary auto-calc) → defaulters → by-source → cancellation analysis → audit log → admin CRUD for clinics, staff, services, products, promotions, referral sources, flags, change requests

**Rule:** If a screen doesn't fit one of A–E, delete it. (This is what was missing in the previous build — features existed but didn't connect.)

---

## Critical implementation rules (PRD §6)

| # | Rule | Where it lives |
|---|---|---|
| 6.1 | **No jsPDF.** All clinical PDFs via docxtemplater + LibreOffice. All invoices via exceljs | `src/lib/templates/docx.ts`, `src/lib/templates/xlsx.ts` |
| 6.2 | Invoice number: `{slug}/{seq:0000}/{branch:000}-{yyyy}`, both counters atomic | `src/lib/invoice-numbering.ts` |
| 6.3 | Discount FIRST, promo SECOND (Apr 17 ruling) | `src/lib/discount.ts` |
| 6.4 | `participantCount > 1` → invoice qty locked | New-invoice form |
| 6.5 | Two consent paths: DIGITAL_PAD OR PHYSICAL_SCAN; disclaimer banner | `src/components/intake/intake-form-shell.tsx`, assignment client |
| 6.6 | Therapist dropdown filtered by patient's `selectedCategories`; clinical service picker by therapist's `departmentId`; invoice picker unscoped | `src/app/dashboard/assign/*`, clinical components |
| 6.7 | `Appointment.cancelledBy ∈ {PATIENT, THERAPIST, CLINIC}`; reports split by it | Calendar + reports |
| 6.8 | Every mutation calls `createAuditLog` | `src/lib/audit.ts` + 25+ API routes |
| 6.9 | Inventory atomic conditional decrement | `src/app/api/inventory-usage/*` |
| 6.10 | Multi-clinic via `Centre`; centre switcher; reports scope by centre | `src/lib/centre.ts` |
