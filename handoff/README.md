# MBD Clinic OS — Portable Handoff Bundle

Three things in this folder, three uses. Pick the one you're doing.

```
handoff/
├── design/       → upload to claude.ai/design
├── session/      → paste into a new Claude conversation for continuity
└── reproduce/    → spin up a working copy on a fresh machine
```

---

## 1. Hand off the design to Claude Design

You're iterating on UI/UX at **[claude.ai/design](https://claude.ai/design)** and want the output to match the existing warm-neumorphic visual language instead of inventing a new one.

1. Open claude.ai/design, create a project called "MBD Clinic OS".
2. Upload, in this order:
   - `design/DESIGN_HANDOFF.md` — seeds the design system
   - `design/globals.css` — raw tokens
   - The whole `design/components-ui/` folder — 22 Radix-based primitives
   - The whole `design/layout/` folder — shell + chrome (NavLink, command palette, notification bell, centre switcher)
3. Capture screenshots per `design/screenshots/README.md` and drop them in `design/screenshots/`. Upload that whole folder too.
4. Iterate. When happy, export the **handoff bundle** and paste it back into Claude Code with: *"Implement this for [screen name]."*

If the live source changes, run `.\refresh.ps1` from the repo root to re-snapshot the design files. Doc + globals + components are all overwritten in place; nothing is deleted.

---

## 2. Continue a session in any Claude surface

You're starting a fresh Claude Code conversation (here, in another worktree, or on a colleague's machine) and want continuity with what we've shipped.

Paste these three files into the new conversation:

- `session/audit-findings.md` — the audit, with current shipped/deferred statuses
- `session/what-shipped.md` — chronological commit log with what each batch closed
- `session/decisions.md` — locked decisions (atomic counters, audit gate, CSP, cookie httpOnly, etc.)

If you need credentials or the locked PRD vocabulary too:

- `session/credentials.md` — email/password reference
- `session/prd-anchors.md` — three-term vocabulary, RBAC matrix, the five journeys

Then ask the question. Claude has the same starting point as me here.

---

## 3. Reproduce the running app from scratch

You're standing up the app on a new machine — yours, a colleague's, or a fresh VPS.

Follow `reproduce/quickstart.md` end-to-end. It assumes Node 20, Docker, and LibreOffice are installed. Takes ~10 minutes if the dependencies are already there.

Sub-references inside `reproduce/`:

- `env-template` — every required environment variable with placeholder + one-line explanation
- `docker-postgres.md` — exact Docker command and how to verify Postgres is ready
- `smoke-guide.md` — what each of the 12 smoke scripts covers and how to interpret a green vs. red run

When the app is up, log in with `marazban@mbd.in` / `mbd2026` and find the **Demo Patient — Walk-Through** (`COL-MBD-DEMO`) in the patients list. That single seeded patient exercises the full happy path (intake → assignment → consultation → package → invoice → payment → MIS).

---

## Keeping the bundle fresh

The `design/` folder contains snapshots of live source — they'll drift as the codebase evolves. To re-snapshot:

```powershell
.\handoff\refresh.ps1
```

The script is idempotent (overwrites in place, no deletions) and prints a summary of what it copied. Re-running after every meaningful design-system change keeps the bundle in sync.

The `session/` and `reproduce/` folders are hand-authored and don't auto-refresh — update them when you ship a meaningful batch (look at the last entry in `session/what-shipped.md` for the pattern).

---

## What's NOT in this bundle

- Anything from `reference/og-codebase/`, `reference/clinic2-codebase/`, or `reference/audits/` — those are historical material; the bundle distills only what's still relevant after the merge.
- A real `.env` — only the template with key names. Generate your own `AUTH_SECRET` with `npx auth secret`.
- Screenshots — list of what to capture in `design/screenshots/README.md`; you grab them while running the app.
- `node_modules/`, `.next/`, build artifacts — `reproduce/quickstart.md` covers installing those.
