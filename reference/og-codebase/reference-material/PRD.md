# Movement By Design — Clinic Operating System

> **Status: LOCKED.** No clarifying questions go back to the client. Every decision is taken based on the artifacts in `/reference-material/` and the prior conversations. Where the client has previously contradicted himself, the resolution is documented inline with reasoning, and that resolution is final.

> **Audience: Claude Code.** This document is the single source of truth for the build. It supersedes any conflicting instruction in code comments, README files, the existing reference repo, or other markdown. When the existing repo and this PRD disagree, follow this PRD.

---

## 0. Reference materials & how to use them

You have access to:

| Path | What it is | How to treat it |
|---|---|---|
| `/reference-material/formats/` | The client's actual DOCX/XLSX/PDF files (intake forms, consultation forms, follow-up sheets, invoice templates, master data, MIS format) | These are **literal templates**. The system fills them. Do NOT redraw them in jsPDF. Use `docxtemplater` (DOCX) and `exceljs` (XLSX). Output is byte-identical to the source format. |
| `/reference-material/legacy-codebase/` | The previous attempt at this build | **Reference only.** Read it to understand what features existed and what schema worked. Do NOT copy its mistakes (orphan files, parallel architectures, redirect-only routes, jsPDF "inspired-by" outputs). Every feature in the legacy must exist here, but properly wired. |
| `/reference-material/PRD.md` | This document | The spec. |

**Rule: every feature listed in section 3 must be reachable from a real user journey in section 4. If a feature exists but no journey leads to it, it doesn't get built.**

---

## 1. Product summary

Movement By Design (MBD) is a multi-modality wellness clinic in Colaba, Mumbai. Founder is Marazban Doctor (OWNER). Co-admin is Dr. Yasir Zahid (Head Physiotherapist).

The system manages: patient intake → therapist assignment → consultation → packages → sessions → invoicing → payments → MIS reporting, plus inventory, change requests, audit logging, and multi-clinic operations.

**21 staff. 7 clinical departments (Medical, Physiotherapy, Massage, Yoga, Counselling, Nutrition, S&C). 60 service line items. 13 product SKUs.**

---

## 2. Domain vocabulary — read this first

The single biggest cause of confusion in earlier iterations was the word "service" being used for three different concepts. **Use these three terms throughout the codebase. Never use the bare word "service" in schema, variable names, or UI copy unless the meaning is unambiguous from context.**

| Term | What it means | Who decides | When |
|---|---|---|---|
| **`service_category`** | The clinical department the patient is interested in. One of: Medical, Physiotherapy, Massage, Yoga, Counselling, Nutrition, S&C, Pain/Injury (mixed referral), Wellness Consult (general) | **Patient** | At intake form |
| **`billable_service`** | A specific line item from the rate card (e.g. "Sports / Deep Tissue Massage (60 min)", "Personal Coaching (Duo)"). Has a price, GST rate, HSN/SAC, participant count | **Therapist** decides clinically; **FO** records on invoice | After consultation |
| **`treatment_protocol`** | What was actually done in a session — modality, exercises, taping, cupping, etc. | **Therapist** | During session |

The Apr 28 WhatsApp resolution from the client, paraphrased: *"FO assigns therapist. Therapist decides services. If extra services are needed, therapist recommends, FO adds them to the package."* That maps cleanly onto the three terms above. **This is the locked model. Apr 4 and Apr 25 messages where the client said "FO selects service" are superseded.**

---

## 3. Roles & access matrix (LOCKED)

Six roles. No "MANAGER" role — the previous build had it but no one fills it; remove. Add **DEV** for development.

| Role | Who | Default emails |
|---|---|---|
| `OWNER` | Marazban Doctor | `marazban@mbd.in` |
| `ADMIN` | Dr. Yasir Zahid (Head Physio, also acts clinically) | `yasir@mbd.in` |
| `FRONT_OFFICE` | Ramchandra, Lata, Helen | `{first}@mbd.in` |
| `CONSULTANT` | Medical doctors, e.g. Dr. Prerna | `{first}@mbd.in` |
| `THERAPIST` | All other clinical staff (physios, massage, yoga, counsellors, nutritionists, S&C coaches) | `{first}@mbd.in` |
| `DEV` | Developer access — sees every page | `dev@mbd.in` |

Default password (dev/seed only): `mbd2026`. Force password change on first login in production.

### 3.1 Permission matrix

| Permission | OWNER | ADMIN | FO | CONSULTANT | THERAPIST | DEV |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Patients** |
| Generate intake QR / link | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| View patients (all) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| View patients (assigned to self) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit demographics | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Assign therapist | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Edit clinical record (own assignments) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| View all clinical records read-only | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Appointments** |
| View calendar (all therapists) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Book / reschedule / cancel appointment | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Request appointment change (clinician proposes) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Review change request | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Billing** |
| View invoices | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Create / edit invoices | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| View payments | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Record payments | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| View packages | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit packages | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Reports** |
| View reports (cancellations, defaulters, by-source, staff productivity) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| MIS dashboard | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Export CSV | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Admin** |
| Manage staff | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Manage clinics | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage services & rates | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Manage products / inventory | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Manage promotions | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage referral sources | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Audit log view | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Client flags | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |

### 3.2 Two contested decisions, locked

**Q1: Can unassigned therapists view another therapist's patient records?**
**Decision: NO.** Therapists/Consultants only see patients they are actively assigned to. Read-only access for unassigned staff is removed.
*Reasoning:* Yasir (Mar 26) said yes; Marazban (Apr 17) leaned no, said "let me think." Privacy-by-default is the safer interpretation. Owner/Admin retain full read access.

**Q2: How does therapist switching affect record edit access?**
**Decision:** When a patient is reassigned to a new therapist, the **old assignment is closed (`endedAt` set)**. Old therapist immediately drops to view-only on records they previously created. They cannot edit, even retrospectively. The new therapist gets edit access from that moment forward, only on records they create themselves. Records once saved with status `COMPLETED` are append-only — even the original author cannot edit them. Only OWNER can edit completed records.
*Reasoning:* Apr 10 message: *"If FO allocates a therapist, only that therapist gets edit access. If FO changes the therapist, new therapist gets edit access from that time onwards. Cannot change old remarks."*

---

## 4. The five user journeys (LOCKED)

Every screen, every API call, every piece of data has to belong to one of these five journeys. **If you build something that doesn't appear here, delete it.** This is what was missing in the previous build — features existed but didn't connect into journeys.

### Journey A — Walk-in patient, first visit

| # | Actor | Screen | Action | Data written | Next |
|---|---|---|---|---|---|
| A1 | Patient walks in | n/a | Talks to FO | — | A2 |
| A2 | FO | Intake → Generate QR | Click "New Intake". System creates `IntakeToken` (60-min expiry). Phone shows QR. | `IntakeToken{token, expiresAt, status:PENDING, createdById:FO_id}` | A3 |
| A3 | Patient (own phone) | `/intake/[token]` | Fills 2-page form: demographics + visit reasons (multi-select from 8 categories) + reads consent, terms, cancellation policy + acknowledges (checkbox) | `Client{status:DRAFT, ...}`, `IntakeForm{...}`, `IntakeToken.status=COMPLETED` | A4 |
| A4 | FO | Assignment dashboard | Sees toast/notification: new intake. Reviews the patient's selections. **Fills in:** customer type (Walk-in / Referral / Booking), referral source if applicable. **Selects one or more therapists** matching the categories. Optional: leaves a note. | `Client.status=ACTIVE`, `Client.customerType`, `Client.referralSourceId`, one or more `ClientDoctorAssignment{clientId, staffId, isPrimary, assignedAt}` | A5 |
| A5 | FO | Consent step | System renders the **client's intake form (DOCX template) prefilled** with everything submitted in A3 + assignment in A4. Preview on screen. Two paths: **(a) print → physical signature → scan/photo upload**, OR **(b) digital signature pad → patient signs on tablet** *(see §6.5; digital sig stored as image, not legally binding without DocuSign — display a clear warning)*. | `Client.consentFormPhotoUrl`, `IntakeForm.consentSigned=true`, `IntakeForm.liabilityWaiverSigned=true`, `IntakeForm.commercialTermsAccepted=true`, `IntakeForm.cancellationPolicyAcknowledged=true` | A6 |
| A6 | FO | Calendar | Books an appointment slot for the assigned therapist. Drag-to-create on FullCalendar. Clash check against existing appointments. | `Appointment{clientId, therapistId, startTime, endTime, status:CONFIRMED}` | A7 |
| A7 | System | Notification | Therapist sees notification on their dashboard. | `Notification{targetUserId:therapistId, type:NEW_PATIENT, ...}` | B (booking journey ends, therapist daily journey continues) |

### Journey B — Patient already booked, returning for a session

| # | Actor | Screen | Action | Data written | Next |
|---|---|---|---|---|---|
| B1 | Patient | n/a | Arrives at clinic for booked appointment | — | B2 |
| B2 | FO | Calendar | Checks the appointment in. Optionally records vitals (clinic policy is therapist does this, but FO can pre-fill). | `Appointment.status=COMPLETED` (eventually) | B3 |
| B3 | Therapist | Therapist dashboard → today's patients | Sees patient name, time, prior consultation summary | — | B4 |
| B4 | Therapist | Patient detail → Clinical record → New consultation OR follow-up | **Decision logic:** if patient has no prior `Consultation` of this `service_category` → fill **Consultation form** (full intake-style). If they do → fill **Follow-up form** (single row added to repeating table). The form is the appropriate template per modality. | `Consultation{...}` OR `Session{packageId?, treatmentNotes, progressUpdates, status:SCHEDULED→COMPLETED}` | B5 |
| B5 | Therapist | Same screen | If recommended: select billable services (one or many) + recommended # of sessions. Save. | `Consultation.recommendedSessions`, line items staged for FO to convert to Package + Invoice | B6 |
| B6 | FO | Patient detail → Create Package | Sees therapist's recommendations. Creates package. Generates invoice (Services template). Records payment (or queues for later). | `Package{...}`, `Invoice{...}`, `Payment{...}`, `MisEntry{...}` snapshots | B7 |
| B7 | System | — | If package balance ≤ `expiryWarningDays`, alert. If invoice unpaid past due, alert. | `Alert{...}` | end |

### Journey C — Therapist daily flow

| # | Actor | Screen | Action |
|---|---|---|---|
| C1 | Therapist logs in | `/dashboard` | Sees: today's appointments, patient count assigned, pending follow-ups, low-stock alerts (if relevant), notifications |
| C2 | Therapist | Calendar (own only) | Sees own day/week. Read-only on others' calendars. Can propose reschedule via Change Request (FO reviews). |
| C3 | Therapist | Patient directory | Sees only patients assigned to them. Search/filter. |
| C4 | Therapist | Per-patient clinical record | Edits records for own assignments. Old records they created but were reassigned away from = view-only. Records by other therapists for this patient = invisible (per §3.2 Q1). |
| C5 | Therapist | Inventory consume | If a session uses a product (e.g. kinesio tape during physio), records consumption. Decrements `InventoryItem.stock`. |
| C6 | Therapist | Profile | Updates own signature image. Changes password. |

### Journey D — Front office daily flow

| # | Actor | Screen | Action |
|---|---|---|---|
| D1 | FO logs in | `/dashboard` | Sees: pending intakes (no assignment yet), today's appointments, unpaid invoices, change requests pending review, low-stock products |
| D2 | FO | Intake | Generates QR for new patient. (Journey A) |
| D3 | FO | Assignment | Reviews submitted intakes, assigns therapists, captures consent. (Journey A) |
| D4 | FO | Calendar | Books, reschedules, cancels appointments. Records cancellation reason + cancelled-by (PATIENT / THERAPIST). |
| D5 | FO | Patient directory | Searches all clients. Edits demographics. Manages flags (VIP, CAUTION, etc.). |
| D6 | FO | Billing → Invoice | Creates invoices: Services / Products / Manual. Applies discounts and promos in correct order. Generates XLSX. |
| D7 | FO | Billing → Payments | Records payments (Cash / Card / UPI / NEFT / Razorpay link / Other). Updates invoice status. |
| D8 | FO | Packages | Tracks expiring packages. Alerts patients to renew. |
| D9 | FO | Inventory | Records new stock arrivals. Updates supplier/price. Sells products via the Products invoice. |
| D10 | FO | Change requests | Reviews therapist-raised reschedule/reassign requests. Approves or rejects. |

### Journey E — Owner / Admin overview & MIS

| # | Actor | Screen | Action |
|---|---|---|---|
| E1 | Owner logs in | `/dashboard` | Full overview: revenue today/week/month, patient count, staff utilization, outstanding dues |
| E2 | Owner | Reports → MIS | Drills into the 31-column MIS table. Filters by date range, centre, department, consultant. Exports CSV. |
| E3 | Owner | Reports → Staff productivity | Sees per-staff: completed sessions, cancelled (split: by-patient vs by-therapist), no-shows, revenue generated. **Salary/incentive calc is NOT auto-computed** (no matrix received) — show data, owner exports and applies his own formula offline. |
| E4 | Owner | Reports → Defaulters | List of patients with frequent late cancellations. Configurable threshold. |
| E5 | Owner | Reports → By Source | Revenue breakdown by referral source. |
| E6 | Owner | Admin → Clinics | Adds new clinic. Auto-copies services + products from existing clinic. Staff assigned per-clinic. |
| E7 | Owner | Admin → Audit | Sees full audit log: who changed what, when, before/after. Filterable by entity, user, date. |
| E8 | Owner | Admin → Promotions | Creates promo codes (Senior Citizen 5%, Festival 10%, etc.) with date validity, max uses, max discount cap. |

---

## 5. Data model (Prisma schema, LOCKED)

This is the schema. Note key changes from the legacy:
- Removed `MANAGER` role
- `Service` carries `serviceCategoryEnum` (department-name-based) for filterability
- `Service.participantCount` locked (1/2/3) for invoice qty enforcement
- `MisEntry.type` added (Clinic / Gym / Online / HomeVisit / Product) for the Sheet2 summary
- `InventoryItem` has supplier + selling/supply price split + price history
- `IntakeToken` is the QR-flow primary
- `ClientDoctorAssignment.endedAt` + `replacedByAssignmentId` for therapist-switch history

```prisma
// ─── CENTRE ──────────────────────────────────────────
model Centre {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique  // used in IDs: COL-MBD, AND-MBD, etc.
  location  String
  address   String?  // JSON: line1, line2, city, pincode
  contactPhone String?
  gstNumber String?
  panNumber String?
  bankName  String?
  bankAccountNumber String?
  bankIfsc  String?
  bankBranch String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  staff        Staff[]
  clients      Client[]
  appointments Appointment[]
  sessions     Session[]
  invoices     Invoice[]
  services     Service[]
  inventoryItems InventoryItem[]
  intakeTokens IntakeToken[]
  misEntries   MisEntry[]
  invoiceCounters InvoiceCounter[]
}

// ─── INVOICE COUNTER (for atomic, gap-free numbering per centre per FY) ─
// Ensures concurrent invoice creates don't collide. Uses Prisma upsert+increment.
model InvoiceCounter {
  id           String  @id @default(cuid())
  centreId     String
  centre       Centre  @relation(fields: [centreId], references: [id])
  financialYear String  // e.g. "2026-2027"
  lastSequence Int     @default(0)
  
  @@unique([centreId, financialYear])
}

// ─── DEPARTMENT ──────────────────────────────────────
model Department {
  id             String  @id @default(cuid())
  name           String  @unique  // Medical, Physiotherapy, Massage, Yoga, Counselling, Nutrition, S&C
  defaultGstRate Float   @default(0)
  defaultHsnSac  String?
  isActive       Boolean @default(true)

  services Service[]
  staff    Staff[]
}

// ─── SERVICE (billable_service) ──────────────────────
model Service {
  id               String  @id @default(cuid())
  name             String
  hsnSacCode       String?
  basePrice        Float
  gstRate          Float   @default(0)  // Stored as fraction (0.18 = 18%)
  isActive         Boolean @default(true)
  participantCount Int     @default(1)  // 1=individual, 2=duo, 3=trio
  serviceType      String  @default("CLINIC")  // CLINIC | GYM | ONLINE | HOME_VISIT — drives MIS Type column
  
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
  
  // Service can be scoped to a centre or available across all centres (centreId null)
  centreId String?
  centre   Centre? @relation(fields: [centreId], references: [id])
  
  // Links
  consultations    Consultation[]
  sessions         Session[]
  appointments     Appointment[]
  doctorAssignments ClientDoctorAssignment[]
  
  @@unique([name, departmentId, centreId])
}

// ─── PRODUCT ─────────────────────────────────────────
model Product {
  id           String  @id @default(cuid())
  name         String
  sku          String? @unique
  category     String? // EQUIPMENT | CONSUMABLE | SUPPLEMENT | OTHER
  hsnSacCode   String?
  gstRate      Float   @default(0)
  isActive     Boolean @default(true)
  
  inventoryItems InventoryItem[]
}

// ─── INVENTORY ITEM (per-centre stock + pricing) ─────
model InventoryItem {
  id            String   @id @default(cuid())
  productId     String
  product       Product  @relation(fields: [productId], references: [id])
  centreId      String
  centre        Centre   @relation(fields: [centreId], references: [id])
  
  // Pricing — supplier may change, so we keep these editable + history
  supplierName  String?
  supplyPrice   Float    @default(0)  // What we pay
  sellingPrice  Float    @default(0)  // What we charge
  
  stock         Int      @default(0)
  minStock      Int      @default(0)
  
  priceHistory  InventoryPriceHistory[]
  logs          InventoryLog[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([productId, centreId])
}

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

model InventoryLog {
  id              String   @id @default(cuid())
  inventoryItemId String
  inventoryItem   InventoryItem @relation(fields: [inventoryItemId], references: [id])
  action          String   // STOCK_IN | STOCK_OUT | ADJUST | SOLD | USED_IN_SESSION
  quantity        Int      // signed: +5 stock-in, -1 used
  notes           String?
  sessionId       String?
  invoiceId       String?
  performedById   String
  createdAt       DateTime @default(now())
}

// ─── STAFF ────────────────────────────────────────────
model Staff {
  id               String  @id @default(cuid())
  name             String
  email            String  @unique
  passwordHash     String
  role             String  @default("THERAPIST")  // OWNER|ADMIN|FRONT_OFFICE|CONSULTANT|THERAPIST|DEV
  designation      String?
  isActive         Boolean @default(true)
  signatureDataUrl String? // PNG base64 — used to auto-stamp signature on PDFs
  
  departmentId String?
  department   Department? @relation(fields: [departmentId], references: [id])
  
  centreId String?
  centre   Centre? @relation(fields: [centreId], references: [id])

  consultations          Consultation[]
  sessions               Session[]
  alerts                 Alert[]
  auditLogs              AuditLog[]
  doctorAssignments      ClientDoctorAssignment[]
  appointments           Appointment[]            @relation("TherapistAppointments")
  notifications          Notification[]
  changeRequestsMade     ChangeRequest[]          @relation("ChangeRequester")
  changeRequestsReviewed ChangeRequest[]          @relation("ChangeReviewer")
  intakeTokensCreated    IntakeToken[]            @relation("IntakeTokenCreator")
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── CLIENT ───────────────────────────────────────────
model Client {
  id                  String    @id @default(cuid())
  clientCode          String    @unique  // COL-MBD-0001
  firstName           String
  lastName            String
  email               String?
  phone               String
  dob                 DateTime?
  age                 Int?
  sex                 String?
  dominance           String?   // RIGHT | LEFT | AMBI
  occupation          String?
  sport               String?
  maritalStatus       String?
  address             String?   // JSON: line1, line2, city, pincode
  emergencyContact    String?   // JSON: name, phone, relationship
  status              String    @default("DRAFT")  // DRAFT | ACTIVE | INACTIVE
  
  visitReasons        String?   // JSON array
  
  customerType        String?   // WALK_IN | BOOKING | REFERRAL
  referralSourceId    String?
  referralSource      ReferralSource? @relation(fields: [referralSourceId], references: [id])
  referredByName      String?   // free-text override

  consentFormPhotoUrl String?
  
  centreId String?
  centre   Centre? @relation(fields: [centreId], references: [id])

  intakeForms       IntakeForm[]
  medicalHistories  MedicalHistory[]  // Initial medical history capture (separate from consultation)
  consultations     Consultation[]
  packages          Package[]
  sessions          Session[]
  invoices          Invoice[]
  alerts            Alert[]
  flags             ClientFlag[]
  doctorAssignments ClientDoctorAssignment[]
  appointments      Appointment[]
  misEntries        MisEntry[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── INTAKE TOKEN (QR flow) ──────────────────────────
model IntakeToken {
  id          String   @id @default(cuid())
  token       String   @unique @default(cuid())
  isUsed      Boolean  @default(false)
  expiresAt   DateTime
  formData    String?  // JSON of submitted patient data (snapshot pre-Client creation)
  status      String   @default("PENDING")  // PENDING | COMPLETED | EXPIRED
  
  centreId    String?
  centre      Centre?  @relation(fields: [centreId], references: [id])
  
  clientId    String?  // populated after FO finalizes assignment
  
  createdById String?
  createdBy   Staff?   @relation("IntakeTokenCreator", fields: [createdById], references: [id])
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── INTAKE FORM (final, post-FO-review) ─────────────
model IntakeForm {
  id                             String  @id @default(cuid())
  selectedCategories             String  // JSON array of service_category strings
  formData                       String? // JSON full payload
  consentSigned                  Boolean @default(false)
  liabilityWaiverSigned          Boolean @default(false)
  commercialTermsAccepted        Boolean @default(false)
  cancellationPolicyAcknowledged Boolean @default(false)
  signatureDataUrl               String? // patient signature (digital pad)
  consentMethod                  String? // PHYSICAL_SCAN | DIGITAL_PAD
  
  frontOfficeExecId String?
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])

  visitDateTime DateTime @default(now())
  createdAt     DateTime @default(now())
}

// ─── MEDICAL HISTORY (initial, separate from per-modality consultation) ─
model MedicalHistory {
  id                  String  @id @default(cuid())
  vitals              String? // JSON: weight, height, bmi, pulse, spo2, bp
  comorbidities       String? // JSON: { dm, htn, cad, pcos, thyroid, other }
  knownAllergies      String?
  chiefComplaints     String?
  pastMedicalHistory  String?
  pastSurgicalHistory String?
  familyHistory       String?
  personalHistory     String? // JSON: { sleep, diet, bowel, others }
  diagnosis           String?
  currentMedications  String?
  planOfCare          String?
  followUp            String?
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  createdAt DateTime @default(now())
}

// ─── CONSULTATION (per-modality, has structured form data) ─
// Maps 1:1 to a clinical template (Physician, Physiotherapy, Counselling intake, Yoga intake, FAB)
model Consultation {
  id                  String    @id @default(cuid())
  templateKey         String    // physician | physiotherapy | counselling | yoga | nutrition | fab
  
  // Common header fields
  vitals              String?   // JSON
  comorbidities       String?   // JSON
  chiefComplaints     String?
  diagnosis           String?
  planOfCare          String?
  treatmentProtocol   String?
  recommendedSessions Int?
  
  // Template-specific structured payload (everything else from the DOCX form)
  formData            String?   // JSON, schema validated by templateKey

  followUp            String?
  status              String    @default("DRAFT")  // DRAFT | COMPLETED | LOCKED
  isLocked            Boolean   @default(false)
  lockedAt            DateTime?
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  consultantId String
  consultant   Staff  @relation(fields: [consultantId], references: [id])
  
  serviceId String?
  service   Service? @relation(fields: [serviceId], references: [id])
  
  packages Package[]
  
  date      DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── PACKAGE ─────────────────────────────────────────
model Package {
  id                String   @id @default(cuid())
  totalSessions     Int
  completedSessions Int      @default(0)
  serviceMix        String   // JSON: [{ serviceId, serviceName, count }]
  validFrom         DateTime
  validUntil        DateTime
  status            String   @default("ACTIVE")  // ACTIVE | EXPIRED | COMPLETED | CANCELLED
  totalPrice        Float
  discountPercent   Float    @default(0)
  discountAmount    Float    @default(0)
  expiryWarningDays Int      @default(14)
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  consultationId String?
  consultation   Consultation? @relation(fields: [consultationId], references: [id])
  
  sessions Session[]
  invoices Invoice[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── SESSION (a single delivered service) ────────────
model Session {
  id               String   @id @default(cuid())
  sessionDate      DateTime
  treatmentNotes   String?
  progressUpdates  String?
  status           String   @default("SCHEDULED")  // SCHEDULED | COMPLETED | CANCELLED | NO_SHOW
  
  // Multi-therapist allotment (for cases like Duo where 2 therapists co-deliver)
  allotments       String?  // JSON: [{ therapistId, therapistName, serviceId, serviceName }]
  perSessionAmount Float?
  
  packageId String?
  package   Package? @relation(fields: [packageId], references: [id])
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  therapistId String
  therapist   Staff  @relation(fields: [therapistId], references: [id])
  
  serviceId String
  service   Service @relation(fields: [serviceId], references: [id])
  
  centreId String?
  centre   Centre? @relation(fields: [centreId], references: [id])
  
  // Inventory consumed during this session
  inventoryUsage   String?  // JSON: [{ inventoryItemId, productName, qty }]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── INVOICE ─────────────────────────────────────────
model Invoice {
  id              String    @id @default(cuid())
  invoiceNumber   String    @unique  // COL-MBD/0001/426-2026
  invoiceType     String    @default("INVOICE")  // INVOICE | PROFORMA
  invoiceFlavor   String    @default("SERVICES") // SERVICES | PRODUCTS | MANUAL
  
  subtotal        Float
  totalGst        Float
  totalAmount     Float
  paidAmount      Float     @default(0)
  
  // Manual line discount
  discountPercent Float     @default(0)
  discountAmount  Float     @default(0)
  discountType    String    @default("PERCENT")  // PERCENT | FLAT
  
  // Promo applied AFTER discount (per Apr 17 ruling: discount first, promo second)
  promotionId       String?
  promotion         Promotion? @relation(fields: [promotionId], references: [id])
  promotionCode     String?
  promotionDiscount Float   @default(0)
  
  status          String    @default("DRAFT")  // DRAFT | SENT | PAID | PARTIAL | OVERDUE | CANCELLED
  dueDate         DateTime?
  validTill       DateTime? // Proforma only
  referredBy      String?
  
  // Line items as JSON. Each line: { service|product, hsnSac, qty, perAmount, lineDiscount, gstRate, lineTotal, consultantId?, consultantName? }
  lineItems       String
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  packageId String?
  package   Package? @relation(fields: [packageId], references: [id])
  
  centreId String?
  centre   Centre? @relation(fields: [centreId], references: [id])

  payments   Payment[]
  misEntries MisEntry[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── PAYMENT ─────────────────────────────────────────
model Payment {
  id          String   @id @default(cuid())
  amount      Float
  method      String   // CASH | CARD | CHEQUE | NEFT | UPI | RAZORPAY | OTHER
  paymentDate DateTime @default(now())
  reference   String?  // txn id, cheque number, etc.
  
  invoiceId String
  invoice   Invoice @relation(fields: [invoiceId], references: [id])
  
  recordedById String?
  createdAt DateTime @default(now())
}

// ─── APPOINTMENT ─────────────────────────────────────
model Appointment {
  id              String    @id @default(cuid())
  startTime       DateTime
  endTime         DateTime
  status          String    @default("CONFIRMED")  // CONFIRMED | RESCHEDULED | CANCELLED | COMPLETED | NO_SHOW
  notes           String?
  
  cancelledBy     String?   // PATIENT | THERAPIST | CLINIC
  cancelledReason String?
  cancelledAt     DateTime?
  cancelledById   String?
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  therapistId String
  therapist   Staff  @relation("TherapistAppointments", fields: [therapistId], references: [id])
  
  serviceId String
  service   Service @relation(fields: [serviceId], references: [id])
  
  centreId String?
  centre   Centre? @relation(fields: [centreId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── CLIENT-DOCTOR ASSIGNMENT (M2M with history) ─────
model ClientDoctorAssignment {
  id                     String    @id @default(cuid())
  comment                String?
  isPrimary              Boolean   @default(false)
  assignedAt             DateTime  @default(now())
  endedAt                DateTime?  // null = currently active
  endedReason            String?
  replacedByAssignmentId String?

  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  staffId String
  staff   Staff  @relation(fields: [staffId], references: [id])
  
  serviceId   String?
  service     Service? @relation(fields: [serviceId], references: [id])
  serviceName String?  // denormalized for history
  
  // Index: a staff can be re-assigned to the same client over time, so NOT unique on (clientId, staffId)
  // But we need to enforce: at most one active (endedAt=null) per (clientId, staffId)
  @@index([clientId, staffId, endedAt])
}

// ─── PROMOTION ───────────────────────────────────────
model Promotion {
  id            String    @id @default(cuid())
  name          String
  code          String    @unique
  description   String?
  discountType  String    // PERCENT | FLAT
  discountValue Float
  maxDiscount   Float?    // cap for % promos ("upto X")
  validFrom     DateTime?
  validUntil    DateTime?
  maxUses       Int?      // null = unlimited
  usedCount     Int       @default(0)
  isActive      Boolean   @default(true)
  
  invoices Invoice[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── REFERRAL SOURCE ─────────────────────────────────
model ReferralSource {
  id        String   @id @default(cuid())
  name      String   @unique
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  
  clients Client[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── ALERT ───────────────────────────────────────────
model Alert {
  id      String  @id @default(cuid())
  type    String  // PACKAGE_EXPIRY | UNPAID_INVOICE | LOW_STOCK | SCHEDULE_GAP | FOLLOW_UP_DUE
  message String
  isRead  Boolean @default(false)
  
  targetUserId String?
  targetUser   Staff?  @relation(fields: [targetUserId], references: [id])
  
  clientId String?
  client   Client? @relation(fields: [clientId], references: [id])
  
  createdAt DateTime @default(now())
}

// ─── NOTIFICATION ────────────────────────────────────
model Notification {
  id       String  @id @default(cuid())
  type     String  // NEW_PATIENT | APPT_REMINDER | CHANGE_REQUEST | PAYMENT_RECEIVED | etc.
  title    String
  message  String
  isRead   Boolean @default(false)
  priority String  @default("NORMAL")  // LOW | NORMAL | HIGH | URGENT
  metadata String? // JSON
  
  targetUserId String?
  targetUser   Staff?  @relation(fields: [targetUserId], references: [id])
  
  createdAt DateTime @default(now())
}

// ─── CHANGE REQUEST (clinician-raised, FO-reviewed) ──
model ChangeRequest {
  id       String  @id @default(cuid())
  type     String  // RESCHEDULE | REASSIGN | OTHER
  details  String  // JSON
  status   String  @default("PENDING")  // PENDING | APPROVED | REJECTED
  response String?
  
  requesterId String
  requester   Staff  @relation("ChangeRequester", fields: [requesterId], references: [id])
  
  reviewedById String?
  reviewedBy   Staff?    @relation("ChangeReviewer", fields: [reviewedById], references: [id])
  reviewedAt   DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ─── CLIENT FLAG ─────────────────────────────────────
model ClientFlag {
  id       String  @id @default(cuid())
  type     String  // VIP | CAUTION | OVERDUE | FOLLOWUP | CUSTOM
  label    String
  color    String  @default("yellow")
  notes    String?
  isActive Boolean @default(true)
  
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  
  createdById String?
  createdAt DateTime @default(now())
}

// ─── AUDIT LOG ───────────────────────────────────────
model AuditLog {
  id            String   @id @default(cuid())
  action        String   // CREATE | UPDATE | DELETE | LOGIN | EXPORT
  entity        String   // Client | Invoice | Session | etc.
  entityId      String
  changes       String?  // JSON: { field: { old, new } }
  metadata      String?  // JSON
  performedById String
  performedBy   Staff    @relation(fields: [performedById], references: [id])
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime @default(now())
  
  @@index([entity, entityId])
  @@index([performedById, createdAt])
}

// ─── MIS ENTRY (frozen invoice-line snapshot) ────────
// One row per invoice line item, written at invoice creation. Payment fields update as payments arrive.
model MisEntry {
  id String @id @default(cuid())
  
  invoiceId        String
  invoice          Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceLineIndex Int     @default(0)
  
  clientId         String
  client           Client  @relation(fields: [clientId], references: [id])
  
  centreId         String?
  centre           Centre? @relation(fields: [centreId], references: [id])
  
  // Frozen snapshot fields
  centreName         String   @default("MBD Colaba")
  invoiceNumber      String
  invoiceType        String   @default("INVOICE")
  invoiceDate        DateTime
  patientName        String
  patientType        String   @default("New")  // New | Existing
  customerType       String?  // WALK_IN | BOOKING | REFERRAL
  referralSourceName String?
  consultant         String?
  service            String?
  department         String?
  
  // The Type column from his MIS Sheet2 (for the summary table)
  type               String   @default("Clinic")  // Clinic | Gym | Online | HomeVisit | Product
  
  // Amounts
  amount            Float     @default(0)
  discount          Float     @default(0)
  amountBeforeTax   Float     @default(0)
  gstPercent        Float     @default(0)
  gst               Float     @default(0)
  netPayableAmount  Float     @default(0)
  perSessionAmount  Float     @default(0)
  noOfSessions      Int       @default(1)
  sessionNo         Int       @default(1)
  packageStartDate  DateTime?
  
  previousDues      Float     @default(0)
  previousMonthDues Float     @default(0)
  
  // Mutated by payments
  paidAmount    Float   @default(0)
  balanceAmount Float   @default(0)
  excessAmount  Float   @default(0)
  modeOfPayment String?
  reference     String?
  
  isBedUsed     String  @default("No")
  remark1       String?
  remark2       String?
  enteredById   String?
  enteredByName String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([invoiceId])
  @@index([clientId])
  @@index([invoiceDate])
  @@index([centreId])
}

// ─── ATTENDANCE LOG (staff check-in/out) ─────────────
model AttendanceLog {
  id        String   @id @default(cuid())
  staffId   String
  date      DateTime
  type      String   // CHECK_IN | CHECK_OUT
  createdAt DateTime @default(now())
}
```

---

## 6. Critical implementation rules

### 6.1 Format-driven document generation (NO jsPDF "inspired-by" rendering)

This is the most-broken thing in the legacy codebase. **Fix it cleanly.**

**Rules:**
- All clinical-form PDFs (intake, consultation, follow-up) are generated via `docxtemplater` from the actual DOCX files in `/reference-material/formats/`.
- All invoices are generated via `exceljs` from the actual XLSX files in `/reference-material/formats/`.
- The DOCX/XLSX templates live unchanged in `/templates/`. Place placeholders only where data is filled — `{{patient.name}}`, `{{vitals.bp}}`, etc.
- Output options: render to DOCX (download) OR convert DOCX → PDF via LibreOffice headless on the server.
- **No more `src/lib/pdf/*.ts` jsPDF re-implementations. Delete them entirely.**

**Templates to prepare** (as part of the build, modify Marazban's files in place by adding placeholders):

| Template file | Placeholders to add |
|---|---|
| `COMMON PATIENT INTAKE FORM.docx` | name, dob, age, sex, contact, address, email, time-of-visit, emergency-name, emergency-phone, visit-reason-checkboxes, others-text, date, signature image, FO-name, FO-signature image, assigned-to (multi), assigned-by |
| `PHYSICIAN CONSULTATION.docx` | All header fields + 6 vital fields + 5 comorbidity checkboxes + the 12 narrative fields + signature image |
| `PHYSIOTHERAPY CONSULTATION.docx` | Same as Physician + occupation + sport + the 10 examination tables (each cell gets a placeholder) |
| `PHYSICIAN FOLLOW UP SHEET.docx` | Header + repeating table (rows iterated via docxtemplater loop syntax) |
| `PHYSIOTHERAPY FOLLOW UP SHEET.docx` | Same |
| `S&C FOLLOW UP SHEET.docx` | Header + repeating exercise rows (10 cols) |
| `WELLNESS YOGA FOLLOW UP SHEET.docx` | Header + repeating session rows |
| `COUNSELLING FOLLOW UP SHEET.docx` | Header + repeating session rows |
| `NUTRITION COUNSELLING FOLLOW UP SHEET.docx` | Header + vitals + repeating session rows |
| `Invoice Automation System (Services).xlsx` | Client name, invoice no, invoice date, referred-by, line items rows 28-53 (each: B=service, D=consultant, F=qty, G=disc, with E/H/I/K formulas left intact and pulling from MasterData), additional discount, total |
| `Invoice Automation System (Products).xlsx` | Same shape but Products columns |
| `Invoice Automation System (Manual).xlsx` | Like Services but consultant, HSN, rate are manually written (no VLOOKUP) |
| `Proforma Invoice Generator - ALL.xlsx` | Same as Services + valid-till |

**Implementation note:** at server startup, copy the templates from `/templates/` to a working dir. Use `docxtemplater` with `PizZip` for DOCX. Use `exceljs` to load → modify cells → save. For PDF conversion, shell out to `libreoffice --headless --convert-to pdf input.docx`.

The PDF-only forms (FAB, Counselling Intake, Wellness Yoga Intake) — first try to find the DOCX source from the client. If not, recreate as DOCX using `docx-js` to match layout exactly (page 2 of the PRD prep work — I'd build these from scratch to match the visual design, since DOCX is editable).

### 6.2 Invoice numbering (LOCKED format)

Format: **`{centreSlug}/{seq:0000}/{branchCounter:000}-{yyyy}`**

Example: `COL-MBD/0001/426-2026`

- `centreSlug` = `Centre.slug` (e.g. `COL-MBD`, `AND-MBD`)
- `seq` = atomically incrementing sequence per centre per financial year (Apr 1 – Mar 31). Use the `InvoiceCounter` table with an `upsert + increment` transaction.
- `branchCounter` = a 3-digit number that resets monthly (counts invoices for the current calendar month within this centre). Implement via `count` of invoices in the current month for the centre.
- `yyyy` = current calendar year.

Financial year boundary: April 1. So an invoice on Mar 31, 2027 has FY `2026-2027`, and on Apr 1, 2027 starts `2027-2028`.

**The `branchCounter` interpretation is my best inference from the example `COL-MBD/1234/426-2026`.** If client objects later, change to month number (1-12) — easy patch.

### 6.3 Discount + promo stacking

Order is **discount first, promo second**, applied per the Mar 25 / Apr 17 client decisions.

Example, ₹100 invoice:
1. Manual line discount 10% → ₹90
2. Promo SENIOR5 (5%) → ₹85.50

So: `final = (subtotal × (1 - discount)) × (1 - promo)`

Or for FLAT: subtract directly in the same order.

GST is computed on the post-discount, post-promo, pre-tax amount, **per line** using each service's gstRate.

### 6.4 Duo / Trio quantity lock

When invoice line item is added for a service whose `participantCount > 1`:
- Quantity field is **locked to** `participantCount`
- Cannot be edited
- UI shows tooltip: "Auto-set to 2 for Duo / 3 for Trio"

### 6.5 Consent signature

Two paths, both supported:
- **PHYSICAL_SCAN**: FO downloads prefilled DOCX, prints, patient signs on paper, FO uploads photo/scan back. This is the primary path until DocuSign decision is made.
- **DIGITAL_PAD**: Patient signs on a tablet using `signature_pad` library. Image is embedded in the DOCX template via a placeholder.

Both modes set `IntakeForm.consentMethod` accordingly. **Display a banner in the digital-pad mode**: "Digital signature is for record-keeping only. Not legally binding without an audit-trailed e-signature provider." This is honest about the legal status and protects MBD.

### 6.6 Therapist-service scoping

When FO assigns therapist(s) to a patient, the therapist dropdown is filtered to staff whose `Staff.departmentId` matches one of the patient's `selectedCategories`. Loose matching is fine (any therapist in that dept).

When therapist later picks `billable_service` on a consultation, the service dropdown is filtered to services in the therapist's department.

### 6.7 Cancellation tracking

`Appointment.cancelledBy` ∈ {`PATIENT`, `THERAPIST`, `CLINIC`}. Reports must split cancellations by this column. Defaulter report = patients whose `PATIENT`-cancellations exceed N over a window (default: 3 in 30 days, configurable).

### 6.8 Audit log

Every mutating operation (CREATE / UPDATE / DELETE on Client, Invoice, Payment, Session, Consultation, Package, Staff, Service, Promotion) writes an `AuditLog` row with:
- entity, entityId, action
- `changes` JSON: `{ field: { old, new } }`, computed via `computeChanges(old, new)` skipping `id`, `createdAt`, `updatedAt`, `passwordHash`, large JSON blobs
- `performedById` from the session
- `ipAddress` and `userAgent` from request headers

Centralize this in `src/lib/audit.ts`. **All mutation API routes go through this — no exceptions.**

### 6.9 Inventory consumption

Two modes:
- **Sold via invoice** (Products invoice) → decrement `InventoryItem.stock` by qty, write `InventoryLog{action:SOLD}`
- **Used in session** (e.g. tape consumed in physio) → decrement, write `InventoryLog{action:USED_IN_SESSION, sessionId}`

Both mutate `InventoryItem.stock`. When `stock <= minStock`, emit `Alert{type:LOW_STOCK}` to OWNER + ADMIN + FO.

### 6.10 Multi-clinic

`Centre` is the unit. Every transactional record (Client, Invoice, Session, Appointment, InventoryItem) carries `centreId`. Owner/Admin can switch active centre via header dropdown. Lists/dashboards filter by active centre.

Adding a new clinic via Admin → Clinics:
- Form: name, slug, location, address, contact, GST, PAN, bank details
- "Copy from existing" optional dropdown — if selected, duplicate all `Service` and `Product`/`InventoryItem` records to the new centre
- Staff are assigned per-centre — new clinic starts with zero staff

---

## 7. Tech stack (LOCKED)

Identical to legacy where it works. Don't change for change's sake.

- **Next.js 16 App Router** + React 19 + TypeScript
- **Prisma 6** + Postgres (Supabase in prod)
- **NextAuth v5 beta** with Credentials provider, JWT sessions
- **Tailwind v4** + shadcn-style UI components in `src/components/ui/`
- **FullCalendar** for scheduling
- **docxtemplater + PizZip** for DOCX templates *(new — replaces jsPDF for clinical forms)*
- **exceljs** for XLSX templates *(new — replaces jsPDF for invoices)*
- **LibreOffice headless** server-side for DOCX → PDF conversion
- **signature_pad** for consent signatures
- **node-cron** for package-expiry, low-stock, follow-up alerts
- **bcryptjs** for password hashing
- **zod** for input validation
- **recharts** for report charts
- **sonner** for toasts

Don't add: jsPDF (banned), DocuSign SDK (out of scope until client decides), WhatsApp Business API (out of scope), Razorpay SDK (Phase 2).

---

## 8. Routing & nav (LOCKED)

```
/                                       → redirect to /login or /dashboard
/login                                  → NextAuth sign-in
/intake/[token]                         → public patient intake form
/portal/[token]                         → public client view-only portal (if DashboardShare exists)
/dashboard                              → role-aware overview
/dashboard/intake                       → FO intake QR generator + pending intakes
/dashboard/assign                       → FO assignment dashboard
/dashboard/patients                     → patient directory
/dashboard/patients/[id]                → patient detail (overview)
/dashboard/patients/[id]/clinical       → clinical record (template routed by therapist's dept)
/dashboard/patients/[id]/packages       → patient's packages
/dashboard/patients/[id]/invoices       → patient's invoices
/dashboard/calendar                     → FullCalendar view (FO sees all, therapists see own)
/dashboard/sessions                     → session log
/dashboard/billing/invoices             → invoice list + create
/dashboard/billing/invoices/new         → 3-flavor invoice creator (Services / Products / Manual)
/dashboard/billing/invoices/[id]        → invoice detail
/dashboard/billing/payments             → payment list + record
/dashboard/billing/packages             → package management
/dashboard/reports                      → reports landing
/dashboard/reports/mis                  → 31-column MIS table
/dashboard/reports/staff                → staff productivity
/dashboard/reports/defaulters           → frequent-canceller patients
/dashboard/reports/sources              → revenue by referral source
/dashboard/reports/cancellations        → cancellation analysis
/dashboard/admin                        → admin landing
/dashboard/admin/clinics                → centres CRUD
/dashboard/admin/staff                  → staff CRUD
/dashboard/admin/services               → services CRUD (per dept) + bulk import from MBD Master Data XLSX
/dashboard/admin/products                → products + inventory CRUD
/dashboard/admin/promotions             → promo CRUD
/dashboard/admin/referral-sources       → referral source CRUD
/dashboard/admin/audit                  → audit log viewer
/dashboard/admin/flags                  → client flags
/dashboard/admin/change-requests        → review reschedule/reassign requests
/dashboard/settings/profile             → own profile, password change, signature upload
```

**Nav whitelist by role** is the source of truth (in `src/lib/nav.ts`). Pages outside whitelist 404. **OWNER sees everything.** ADMIN sees everything except clinic management and exports. FO sees patient ops + billing + flags + inventory. Therapists see only the things they need (dashboard, calendar, patients, profile).

Delete from legacy: `/dashboard/front-office/*` redirects, `/dashboard/consultation` redirect, `/dashboard/clinical/*` standalone pages (merged into `/dashboard/patients/[id]/clinical`).

---

## 9. Seed data (LOCKED)

Single seed script at `prisma/seed.ts` produces:
- 1 Centre: `COL-MBD` "Movement By Design - Colaba"
- 7 Departments: Medical, Physiotherapy, Massage, Yoga, Counselling, Nutrition, S&C
- 60 Services (parsed from `MBD Master Data.xlsx` → ServicesMasterData sheet)
- 13 Products (parsed from same → ProductMasterData sheet)
- 21 Staff (full list from `STAFF_CREDENTIALS.md` in legacy, password hash for `mbd2026`)
- 1 DEV staff: `dev@mbd.in`
- 5 sample referral sources (Google, Friend, Doctor referral, Walk-in, Instagram)
- 5 sample promotions (Senior 5%, Armed Forces 10%, Festival 15%, Welcome 5%, Referral 10%)
- 30 sample clients with realistic Indian names, varied statuses, some with packages, some with completed sessions, some with unpaid invoices — to populate dashboards
- 100 sample appointments spread over current week ± 2 weeks
- 50 sample completed sessions for staff productivity reports
- 30 sample MIS entries for the MIS dashboard
- 5 sample audit log entries

Make seed idempotent (safe to re-run after `db:reset`).

---

## 10. What's explicitly OUT of scope

These are NOT in this build. If client asks later, scope them as Phase 2.
- **Razorpay live integration** (just the dropdown + manual reference field)
- **HDFC POS integration** (manual UPI/card entry only)
- **WhatsApp Business API** (no automated reminders)
- **DocuSign / legally-binding e-sign** (digital pad image only, with disclaimer)
- **Salary / incentive auto-calc** (no matrix received; staff report shows raw counts/revenue)
- **Email notifications** (in-app only)
- **AI receipt OCR** (explicitly killed by client)

---

## 11. Definition of done

The build is done when:
1. All 5 user journeys (§4) execute end-to-end without dead screens or broken transitions
2. Every feature in the legacy codebase has a corresponding route/feature here, OR is documented in §10 as out-of-scope
3. Every form in `/reference-material/formats/` is wired as a literal template — output is byte-faithful
4. RBAC matrix from §3.1 is enforced both at API level (`hasPermission`) and nav level (whitelist)
5. Audit log captures every CREATE/UPDATE/DELETE on key entities
6. Seed data populates a fully usable demo
7. `npm run build` completes without errors
8. All TypeScript is strict-mode clean
9. README explains: how to run, how to seed, how to add a new clinic, where templates live, how invoice numbering works
