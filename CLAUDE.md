# Movement By Design - Clinic OS (Merged Build)

## Start here
1. Read `/reference/CLAUDE_CODE_PROMPT.md` -- this is your build plan
2. Read `/reference/PRD.md` -- the locked spec
3. Read `/reference/mbd-punchlist.txt` and `/reference/audits/*.md` -- the issues to fix

## Reference layout
- `/reference/og-codebase/`       -> the older `mbd-clinic-os` repo (solid backend; port verbatim)
- `/reference/clinic2-codebase/`  -> the newer `clinic 2` repo (better UI; port the shell)
- `/reference/forms/`             -> the literal DOCX/XLSX/PDF templates the system fills
- `/reference/audits/`            -> audit notes for both prior builds
- `/reference/mbd-punchlist.txt`  -> 12 concrete items to fix
- `/reference/PRD.md`             -> product requirements (locked)

## Merge strategy
OG backend is the base. Port Clinic 2 UI layer onto it.

## Source of truth (order)
PRD > punchlist > audits > OG backend > Clinic 2 UI

## Don't
- Use jsPDF, react-pdf, or any non-template rendering for clinical forms or invoices
- Build features outside the 5 user journeys defined in the PRD
- Leave dead code or "Coming Soon" stubs
- Use the bare word "service" without one of the three qualifiers (serviceCategory / billableService / treatmentProtocol)
