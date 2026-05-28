# Smoke gate — what each script covers, how to read the output

The gate is one command:

```bash
node scripts/run-smokes.mjs
```

Expected output ends with:

```
[run-smokes] PASS ✅ (12 smoke scripts + lint + build) in ~95s
```

If you see that, the codebase is internally consistent: schema → seed → APIs → templates → reports all line up. If any smoke fails, the gate aborts at that script and prints the failure.

---

## The 12 smoke scripts

Each is idempotent — runs as its own short-lived Prisma client, cleans up after itself.

| # | Script | What it verifies |
|---|---|---|
| 1 | `smoke-prisma.ts` | Prisma client connects + an `AuditLog` round-trip writes and reads back |
| 2 | `smoke-templates.ts` | XLSX (invoice) + DOCX (clinical) templates render with placeholders filled |
| 3 | `smoke-followups.ts` | 11 clinical follow-up DOCX templates each render with realistic context |
| 4 | `smoke-consent.ts` | Consent form renders from a draft Client + IntakeForm |
| 5 | `smoke-consent-on-behalf.ts` | FO can submit consent on behalf of a patient |
| 6 | `smoke-clinical.ts` | Physiotherapy consultation (84 fields) renders to a 239 KB PDF |
| 7 | `smoke-change-requests.ts` | Auto-mutate on RESCHEDULE / REASSIGN approval |
| 8 | `smoke-billing.ts` | MANUAL/Products invoice creates + recommendations + inventory decrement |
| 9 | `smoke-multiclinic.ts` | Per-centre isolation (no cross-centre leaks via static analysis + live query) |
| 10 | `smoke-admin.ts` | Services bulk-import is idempotent; attendance roundtrip |
| 11 | `smoke-portal.ts` | Public portal token gates: expired, revoked, well-formed |
| 12 | `smoke-acceptance.ts` | `nav.ts` ↔ `permissions.ts` ↔ `canAccessRoute` align; PRD §4 journey routes resolve |

Then the gate also runs:

| Stage | Command | Failure mode |
|---|---|---|
| Lint | `npm run lint` | ESLint exits non-zero on errors. ~13 pre-existing warnings are tolerated |
| Build | `npm run build` | TypeScript + Next build. Most informative failure path |

---

## When a smoke fails

The runner prints the failing script's name and the error message inline. Common causes:

| Symptom | Likely cause | Fix |
|---|---|---|
| `Can't reach database server at localhost:5432` | Postgres isn't running | `docker start mbd-postgres` |
| `PrismaClient is not configured` | Stale generated client | `npx prisma generate` |
| Schema drift errors | Pushed schema but `next dev` is running with stale client | Stop `next dev`, `npx prisma generate`, `npm run db:push` |
| `LibreOffice failed` | `SOFFICE_BIN` not set or path wrong | Check `.env`; verify the binary exists and is executable |
| Template fill error | DOCX/XLSX template moved or placeholders changed | `templates/` folder is the source of truth; compare against the `.docx` files |

Most smoke failures are a stale process or a missing env var. Restart the dev server and re-run.

---

## When to run the gate

- Before every commit that touches breadth (schema, multiple components, API routes)
- After a `git pull` from another branch
- Before deploying to production
- Whenever you're about to demo

Don't skip it on the assumption "I only changed UI" — Tailwind classes can break Next's build, a typo in a component breaks SSR, and lint catches a lot.

---

## Cron + LibreOffice on the box

These two are runtime dependencies the smoke gate doesn't fully exercise:

- **Cron:** `node-cron` registers daily 02:00 IST jobs (package expiry, low stock, follow-up due). Set `DISABLE_CRON=true` to skip. The runner doesn't test cron firing — you'd see the alerts the next morning.
- **LibreOffice:** Required for DOCX → PDF. The smoke suite hits it (script #6). On a fresh VPS, `apt install libreoffice-core libreoffice-writer` is enough; you don't need the GUI.
