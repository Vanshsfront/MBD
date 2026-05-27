# Movement By Design — Clinic Operating System

## Where to start
1. Read `/reference-material/PRD.md` end-to-end before writing code
2. Read `/reference-material/CLAUDE_CODE_PROMPT.md` for the build plan

## Source of truth
- PRD wins over legacy code, always
- Templates in `/reference-material/formats/` are filled literally with docxtemplater + exceljs (PRD §6.1)
- Three-term vocabulary: serviceCategory / billableService / treatmentProtocol (PRD §2)
- 5 user journeys in PRD §4 — every feature must belong to one

## Stack
Next.js 16 + React 19 + Prisma 6 + Postgres + NextAuth v5 + Tailwind v4 + shadcn UI

## Don't
- Use jsPDF for clinical forms or invoices — banned (PRD §6.1)
- Build features that don't appear in PRD §4 journeys
- Leave dead code, redirect-only routes, parallel architectures
- Use the bare word "service" without one of the three qualifiers
