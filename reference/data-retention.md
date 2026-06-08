# Data retention matrix

| Data category | Retention | Mechanism | Authority |
|---|---|---|---|
| Patient clinical records (Consultation, IntakeForm, MedicalHistory) | 7 years from last visit | Manual review; right-to-erasure on request via `POST /api/clients/[id]/erase` | Indian Medical Council guidelines; DPDPA §8(7) |
| Financial records (Invoice, Payment, MisEntry, InvoiceCounter*) | 8 years from creation | Preserved through right-to-erasure; never auto-deleted | Income Tax Act §44AA; CGST §36 |
| AuditLog | 7 years | Preserved through right-to-erasure (lawful basis: DPDPA §15(c)) | DPDPA §15(c); SOC2 CC7.2 |
| Appointment, Session | Tied to financial — 8 years | Preserved (referenced from Invoice/MisEntry) | Aligns with financial |
| IntakeToken (EXPIRED/COMPLETED) | 7 days | Daily cron: `runIntakeTokenPurgeJob` at 03:00 (`src/lib/cron/jobs.ts`) | DPDPA §8(7) — minimisation |
| Application logs (Pino JSONL) | 30 days | `pino-roll` rotation + manual purge | Operational |
| RumEvent (Core Web Vitals) | 90 days | TODO: nightly cron (Phase 2) | Operational |
| Backup snapshots | 30 days for daily, 12 months for monthly | Manual `pg_dump` + manual rotation | Operational |

## Right-to-erasure flow (DPDPA §13)

1. Patient contacts the clinic requesting deletion.
2. FO/Admin verifies identity (phone + DOB + at least one prior visit detail).
3. OWNER posts to `POST /api/clients/[id]/erase` with `{ reason, confirm: "ERASE" }`.
4. The endpoint anonymises the Client row in place and deletes IntakeForm + MedicalHistory.
5. Financial records (Invoice, Payment, MisEntry, Session) are preserved per tax law — they reference the now-anonymised Client by ID.
6. An audit-log entry with `action: "ERASE"` records the operation.

## What is NOT erased (and why)

- **Invoices and Payments** — tax law mandates 8-year retention. The
  records continue to reference the client by ID; the client's identity
  cannot be reconstructed without joining to a row that has been
  anonymised.
- **Audit log** — DPDPA §15(c) permits processing without consent for
  "compliance with judgment or order" and for "fulfilling any obligation
  to disclose information to the State." Operational and security audit
  logs fall under this carve-out.
- **MisEntry rows** — these are immutable financial snapshots used for
  the MIS export; same justification as Invoice/Payment.

## What remains TODO

- **Periodic erasure review.** Patients who have had no clinical contact
  for > 7 years should be auto-flagged for review. Implementation
  depends on a Phase-2 retention dashboard.
- **Backup erasure.** Right-to-erasure requests should also propagate to
  off-server backups. Today we don't have automated backups so the
  question is moot; once we do, the backup retention policy must
  include a "right-to-erasure propagation" step.
- **RumEvent retention cron.** 90-day purge job is documented above but
  not yet implemented. Add to `src/lib/cron/jobs.ts` when convenient;
  table size is bounded enough that this is not yet urgent.
- **Privacy policy linkage.** Once the privacy policy is published
  (deferred per audit batch), link to this matrix from the policy's
  "How long we keep your data" section.

Reference: `review/audit-2026-06-06.md` F-003, DATA-003, DATA-004.
