# Screenshots for Claude Design

These are auto-generated. Don't capture by hand.

## Regenerate

In one terminal:

```bash
npm run dev
```

In another:

```bash
npm run capture-screenshots
```

Writes 20 PNGs into this folder. Takes ~45 seconds. The script:

1. Confirms `next dev` is reachable at `localhost:3000`
2. Looks up the demo patient (`COL-MBD-DEMO`) via Prisma
3. Mints a fresh `IntakeToken` for the public intake page
4. Launches headless Chromium, authenticates once as `marazban@mbd.in` (Owner)
5. Walks 10 screens × 2 viewports (desktop 1440×900, mobile 375×812)
6. Cleans up the token and the auth state file

## One-time setup (per machine)

After `npm install`:

```bash
npx playwright install chromium
```

Downloads the headless Chromium binary (~110 MB) into `~/.cache/ms-playwright/`. Skip if Playwright is already installed.

## When to regenerate

- After any UI change that affects the captured screens
- Before uploading the design bundle to claude.ai/design
- Before any design review where stakeholders look at the bundle

## What gets captured

| Slug | URL | Why |
|---|---|---|
| `login` | `/login` | First impression; show/hide password toggle |
| `dashboard-overview` | `/dashboard` | Role-aware landing as Owner |
| `intake-staff` | `/dashboard/intake` | QR generator, pending list |
| `assign` | `/dashboard/assign` | Multi-therapist picker + consent capture |
| `patient-detail` | `/dashboard/patients/{demoId}` | Sticky header + sub-tabs |
| `clinical-record` | `/dashboard/patients/{demoId}/clinical` | 80-field form; section nav candidate |
| `calendar` | `/dashboard/calendar` | FullCalendar embed |
| `invoice-new` | `/dashboard/billing/invoices/new` | Most complex form; inline promo preview |
| `mis` | `/dashboard/reports/mis` | 31-column report |
| `intake-patient` | `/intake/{freshToken}` | Mobile-first patient form (no auth) |

Each gets two PNGs: `{slug}-desktop.png` and `{slug}-mobile.png`. Total: 20.

## Files in this folder

- `*.png` — the 20 captures, committed so the bundle is self-contained
- This README

Don't add hand-captured screenshots here — they'll be overwritten on the next `capture-screenshots` run. If you want a one-off shot, put it elsewhere.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Couldn't reach http://localhost:3000` | dev server isn't running | `npm run dev` in another terminal |
| `Demo patient COL-MBD-DEMO not found` | DB hasn't been seeded | `npm run db:seed` |
| `signin returned 500` | Stale Prisma client in `next dev` | Stop & restart `next dev` |
| `Executable doesn't exist` (Playwright) | Browser binary not installed | `npx playwright install chromium` |
| One PNG missing, others fine | The route's selector wasn't found inside the timeout | Re-run; if persistent, the page may have slow data loading — increase timeouts in `scripts/capture-screenshots.ts` |
