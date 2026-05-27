# Movement By Design (MBD) Clinic OS - Context Dump & Technical Log

This document serves as the master context dump, summarizing the project architecture, technology stack, role-based access control, identified issues, and verification state.

---

## 1. Technology Stack
* **Framework**: Next.js (App Router, dynamic page segments).
* **Database**: PostgreSQL (local instance running in Docker container `mbd-postgres` on port 5432).
* **ORM**: Prisma (v7.x, using `@prisma/adapter-pg` pg-pool adapter).
* **Authentication**: NextAuth.js (v5, middleware-based route guards).
* **Styling**: Tailwind CSS & custom Vanilla CSS layout structures.
* **Document Generation**:
  * `docxtemplater` & `pizzip` (interpolating `.docx` files under `/templates`).
  * `docxtemplater-image-module-free` (injecting signatures as base64 images).
  * **LibreOffice Headless** (`soffice.exe`) for `.docx` to `.pdf` compiling.

---

## 2. Key Directories & Project Hierarchy
```
mbd-clinic-os/
├── prisma/
│   ├── schema.prisma         # Prisma schema (Client, Session, Appointment, Invoice, MisEntry, AuditLog, etc.)
│   └── seed.ts               # Idempotent seed populating master services, products, and clients
├── templates/                # Original DOCX templates for consultations and forms
├── src/
│   ├── app/                  # App router pages and API routes
│   │   ├── api/
│   │   │   ├── clients/      # Client intake, assignment, and consent routes
│   │   │   ├── consultations/# Consultation render routes (?format=pdf)
│   │   │   └── admin/        # Staff/Clinic API endpoints
│   │   └── dashboard/        # Role-based landing boards
│   ├── generated/
│   │   └── prisma/           # Custom build destination for Prisma client
│   ├── lib/
│   │   ├── prisma.ts         # Singleton Prisma client setup with pg pool
│   │   ├── permissions.ts    # RBAC matrix and role helpers
│   │   └── templates/
│   │       ├── docx.ts       # DOCX template rendering & PDF conversion pipeline
│   │       └── keys.ts       # Template key registry mappings
│   ├── middleware.ts         # Route guards and authentication redirect rules
│   └── instrumentation.ts    # Next.js instrumentation bootstrap
├── .env                      # Database credentials and SOFFICE_BIN environment configuration
└── package.json              # Project scripts and dependencies
```

---

## 3. Role-Based Access Control (RBAC) Matrix
Permissions are statically hardcoded in `src/lib/permissions.ts` to prevent dynamic privilege escalation:

| Role | Permissions & Access Levels |
| :--- | :--- |
| **OWNER** / **DEV** | Complete administrative dashboard, staff activation, audit logging, revenue metrics, and full client access. |
| **ADMIN** | Management of staff, services, product inventory, promotions, and view-all clinical records. |
| **FRONT_OFFICE** | Client intake, QR code generation, primary doctor/therapist assignment queue, and invoice billing. |
| **CONSULTANT** / **THERAPIST** | Restricted to assigned clients' clinical records, calendar view, session notes, and raise change request forms. |

---

## 4. Solved Issues & Completed Actions
1. **Turbopack Build Resolution (Middleware Path)**:
   * *Problem*: Next.js generated route compilation warnings and middleware mismatches.
   * *Solution*: Moved `instrumentation.ts` and `middleware.ts` from the root directory into the `src/` directory.
2. **Clinical PDF Generation (`ENOENT`)**:
   * *Problem*: No local PDF compiler executable was configured, triggering shell execution failures on template print actions.
   * *Solution*: Installed LibreOffice silently using `winget` into `E:\Program Files\LibreOffice` to preserve space on `C:`.
   * *Result*: Added `SOFFICE_BIN="E:/Program Files/LibreOffice/program/soffice.exe"` to `.env`. Verified via scratch script and in-app browser rendering.
3. **Configuration Backup**:
   * *Result*: Created a rollback-ready backup `.env.bak` containing the original environment setup.

---

## 5. Unresolved / Open Issues (Backlog)
1. **UI Greeting Honorific Glitch**:
   * *Symptom*: Name parsing split logic duplicates/splices greetings (e.g., greeting shows `Welcome, Dr. Dr. Devanshi Vira` when the user profile name is already stored with the prefix `Dr. Devanshi Vira`).
2. **Therapist Patient Access Redirect Gap**:
   * *Symptom*: Attempting to view an unassigned patient's clinical file silently redirects the therapist to `/dashboard/patients`.
   * *Recommendation*: Upgrade the redirect route to present a clear Modal Dialog notifying the therapist that the patient must be assigned by the Front Office.
3. **Disk Capacity Constraint**:
   * *Symptom*: Host C: drive has limited disk capacity (~10 GB free space).
   * *Mitigation*: Installed the large LibreOffice package on `E:` drive. Cache cleanups of `.next/` are advised if disk limits are reached again.

---

## 6. Verification Records
* Detailed workflow audit trail logs: [workflow_audit_log.md](file:///C:/Users/Asus/.gemini/antigravity/brain/f82c8291-6592-47d6-94d6-2936b7be3095/workflow_audit_log.md)
* Interactive testing screenshots: [walkthrough.md](file:///C:/Users/Asus/.gemini/antigravity/brain/f82c8291-6592-47d6-94d6-2936b7be3095/walkthrough.md)
* Verified PDF Output: [test_output.pdf](file:///C:/Users/Asus/.gemini/antigravity/brain/f82c8291-6592-47d6-94d6-2936b7be3095/scratch/test_output.pdf)
