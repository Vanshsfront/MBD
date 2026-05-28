# Screenshots for Claude Design

Drop your screenshots into this folder, then upload the whole folder to Claude Design alongside the rest of `design/`. They give Claude Design concrete visual ground truth so its proposals carry your warm-neumorphic language rather than inventing a new one.

## What to capture

Two viewports per screen — desktop and mobile. Total = 16 PNGs.

| # | Screen | URL | Why |
|---|--------|-----|-----|
| 1 | Invoice builder | `/dashboard/billing/invoices/new` | Most complex screen; highest design payoff |
| 2 | Clinical record | `/dashboard/patients/COL-MBD-DEMO/clinical` | Long form; needs section nav redesign |
| 3 | Calendar | `/dashboard/calendar` | FullCalendar embed; inline conflict overlays |
| 4 | Assignment queue | `/dashboard/assign` | Multi-therapist picker; consent capture |
| 5 | Patient detail | `/dashboard/patients/COL-MBD-DEMO` | Sticky chrome candidate (Epic/Athena pattern) |
| 6 | MIS report | `/dashboard/reports/mis` | 31-column table; filtering chrome |
| 7 | Intake (staff side) | `/dashboard/intake` | QR generator; pending list |
| 8 | Intake (patient side) | `/intake/[any-pending-token]` | Mobile-first patient form |

Optional but useful:

- **Login** (`/login`) — first impression
- **Dashboard root** (`/dashboard`) — what each role lands on (capture as OWNER, FO, THERAPIST)

## How to capture

1. `npm run dev` — app at `http://localhost:3000`.
2. Log in as `marazban@mbd.in` / `mbd2026` (Owner — sees everything).
3. Use Chrome DevTools' device toolbar.
4. Set viewport explicitly:
   - **Desktop:** `1440 × 900` (DPR 1)
   - **Mobile:** `375 × 812` (iPhone 13 Mini, DPR 2)
5. Use the browser's **Capture full size screenshot** option (Cmd-Shift-P → "Capture full size screenshot"). Don't crop manually — Claude Design uses the full visible state.

## Naming convention

`{slug}-{viewport}.png`

Examples:
```
invoice-new-desktop.png
invoice-new-mobile.png
clinical-record-desktop.png
clinical-record-mobile.png
calendar-desktop.png
calendar-mobile.png
assign-desktop.png
assign-mobile.png
patient-detail-desktop.png
patient-detail-mobile.png
mis-desktop.png
mis-mobile.png
intake-staff-desktop.png
intake-staff-mobile.png
intake-patient-desktop.png
intake-patient-mobile.png
```

## Checklist before uploading

- [ ] 8 screens × 2 viewports = 16 PNGs (or 10/20 if you grabbed login + dashboard)
- [ ] No real PHI in shots — Demo Patient (`COL-MBD-DEMO`) is fine; if you tested with real names, redact first
- [ ] No browser chrome (Chrome DevTools' full-page capture excludes it; if you used a different tool, crop the URL bar)
- [ ] Filenames follow `{slug}-{viewport}.png`

That's it. Upload all of `design/` to Claude Design and you're set.
