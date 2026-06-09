# PDF rendering: removed (DOCX/XLSX only)

**Status:** Server-side PDF generation is **disabled**. All render endpoints
return the editable source format (DOCX for clinical forms, XLSX for invoices).
This is a deliberate, deployment-driven decision — not a regression.

## What happened

Two things landed back-to-back on `main` on 2026-06-08:

1. **`ffec581` — fix(deploy): serve DOCX instead of LibreOffice PDF; Vercel build + storage fixes**
   Removed the `convertDocxToPdf` helper from `src/lib/templates/docx.ts` and
   stripped the `?format=pdf` branch out of both consent and consultation
   render routes. Net: ~56 lines deleted from `templates/docx.ts`.

2. **`d6f4471` — audit-2026-06-06** (audit-fixes branch)
   Was branched off `62e2147` *before* `ffec581` landed, so it still carried
   the LibreOffice PDF code. The merge into main (`3aa17aa`) took main's
   removal as the correct resolution — PDF stays gone. The audit branch's
   additions (`phiHeaders`, `assertCentreScope`) were kept.

## Why

LibreOffice (`soffice`) is the only headless DOCX→PDF converter we had
integrated. It does not run inside the Vercel serverless / Edge runtime:

- The Vercel function image does not include LibreOffice binaries.
- Even if bundled, the cold-start cost (~2–5 s) and memory footprint
  (~300 MB) push functions past their limits.
- The fallback we had — *try PDF, log error, fall back to DOCX* — produced
  a "PDF conversion failed" log line on **every** request in production,
  because PDF *always* failed. The fallback became the only path. Removing
  the dead path makes the behaviour honest.

## Current behaviour

| Route | Returns | If `?format=pdf` is passed |
|---|---|---|
| `GET /api/clients/[id]/consent-render` | DOCX | Query is **ignored** — DOCX returned |
| `GET /api/consultations/[id]/render` | DOCX | Query is **ignored** — DOCX returned |
| `GET /api/invoices/[id]/render` | XLSX | n/a (was never PDF) |

All three use `phiHeaders()` from `src/lib/responses.ts` — no-store, no-cache,
PHI-safe. The `Content-Disposition` is `attachment; filename="..."` so
browsers download the file rather than embedding it.

## Implications for the UI

- The "Download PDF" button (if any) should be renamed to "Download DOCX" or
  the underlying request should drop the `?format=pdf` query param. Today
  it silently downloads a DOCX with the same filename stem.
- Anything in the codebase still **constructing** a `?format=pdf` URL is
  effectively dead code and can be removed.
- For end users, the practical change is: their browser opens Word (or the
  configured DOCX viewer) instead of a PDF viewer. The document content is
  identical.

## If PDF is required again, options ranked

1. **Client-side DOCX→PDF** (preferred). Use `docx-preview` to render the
   DOCX into an HTML/canvas in the browser, then `window.print()` to PDF
   via the browser's print pipeline. No server changes; no extra
   infrastructure. Loses some DOCX features (image modules, complex
   tables) — verify against the actual templates.

2. **Out-of-process PDF service.** Stand up a small container with
   LibreOffice or Gotenberg on Render/Fly/Cloud Run; have the Vercel route
   POST the DOCX, receive the PDF. Adds infrastructure, ~$5–20/month, and
   a network hop. Use this if (1) doesn't preserve the templates faithfully.

3. **Switch the source format.** Author the templates as HTML+CSS instead
   of DOCX and render via Puppeteer/Playwright on Vercel (puppeteer-core +
   @sparticuz/chromium fits the 50 MB serverless limit). Largest change —
   you lose the "open in Word and edit" workflow.

Do **not** try to bring LibreOffice back into the Vercel function. It will
fail the same way again.

## Don't reintroduce

The following symbols/patterns were removed and should stay removed unless
the deployment target changes:

- `convertDocxToPdf()` in `src/lib/templates/docx.ts`
- `if (format === "pdf") { ... convertDocxToPdf ... }` branches in render routes
- `console.error("[... render] PDF conversion failed; returning DOCX", err)`
  log lines — the dead-path tell.

## Related

- Commit `ffec581` — original removal (deploy fix on main)
- Commit `d6f4471` — audit branch that didn't know about the removal
- Merge commit `3aa17aa` — where the conflict was resolved in main's favour
- Files: `src/app/api/clients/[id]/consent-render/route.ts`,
  `src/app/api/consultations/[id]/render/route.ts`,
  `src/lib/templates/docx.ts`,
  `src/lib/responses.ts` (phiHeaders)
