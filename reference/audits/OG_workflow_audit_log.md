# MBD Clinic OS — Workflow Audit & Verification Log

This log documents all findings, anomalies, visual glitches, and route-redirect behaviors observed during the systematic, multi-role validation of the application.

---

## Verified Roles & Sessions

* **Front Office (`ramchandra@mbd.in`)**: Checked out successfully. Sidebar restrictions verified. QR generation, assignment queue, and new invoice rendering verified.
* **Therapist (`devanshi@mbd.in`)**: Checked out successfully. Calendar events and change requests submission verified.
* **Owner (`marazban@mbd.in`)**: Checked out successfully. Administrative actions (approvals and audit trails review) verified.

---

## Identified Issues & UX Deficiencies

### 1. Welcome Title String Splitting Glitch (UI)
* **Symptom**: When logged in as a Therapist (Dr. Devanshi Vira), the dashboard page header renders as `Welcome, Dr.`.
* **Path**: `/dashboard`
* **Underlying Cause**: The greeting template splits the user's name by spaces or trims after the first token to extract the first name. Since clinical accounts are registered with their honorific (e.g. `Dr. Devanshi Vira`), the first token is `Dr.`, resulting in an incomplete greeting.
* **Severity**: **LOW** (Visual Polish).

### 2. Silent Redirection for Unassigned Calendar Patients (UX / Authorization)
* **Symptom**: A therapist sees a patient (e.g., *Saanvi Patel*) scheduled on their calendar card, but clicking their name or direct link `/dashboard/patients/[id]/clinical` silently redirects the therapist back to the `/dashboard/patients` page.
* **Underlying Cause**: The therapist does not have a formal `ClientDoctorAssignment` record in the database for that client. While the calendar displays the scheduled slot, the `RoleGuard` and patient route middleware block access and redirect the user because they are not formally "assigned".
* **Recommendation**: Instead of a silent redirect, the app should display a modal or alert indicating: *"Access Blocked: You must be assigned to this patient in the Front Office assignment queue to open their medical records."*
* **Severity**: **MEDIUM** (Functional UX Block).

### 3. Disk Space Errors on Browser Screenshot Save (Platform-specific)
* **Symptom**: The browser subagent encountered an error `There is not enough space on the disk` during screenshot captures in step 6 & 7 of the Front Office run.
* **Underlying Cause**: This is a host-level system issue. The runner's C: drive has ~10.7 GB free, which can trigger write failures under heavy resource usage or when writing to specific Windows temporary directories.
* **Severity**: **N/A** (Does not affect local clinic app operation).

---

## Compliance and Security Status

* **RBAC Enforcement**: **PASS**. Navigation menus are correctly masked. API endpoints (`/api/admin/staff`, `/api/admin/change-requests`, `/api/reports/*`) return appropriate forbidden status codes when queried by unauthorized roles.
* **Database Logs & Audit Trail**: **PASS**. Every client status change, new assignment, and change request approval is correctly logged in the database and renders with audit-trail change diffs in `/dashboard/admin/audit`.
