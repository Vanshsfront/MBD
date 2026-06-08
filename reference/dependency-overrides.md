# package.json `overrides` rationale

## `xmldom: 0.6.0`

**Why pinned:** `docxtemplater-image-module-free` declares an older `xmldom`
that carries 8 published advisories:

- 1 Critical: misinterpretation of malicious XML input (GHSA-h6q6-9hqw-rwfv).
- Several High/Moderate: XML injection via CDATA, processing-instruction
  injection, DocumentType injection, comment injection, uncontrolled
  recursion DoS, multiple root nodes.
- `fixAvailable: false` from `npm audit` — upstream is unmaintained.

`0.6.0` is the latest release. It does **not** patch the known issues but
it is the best-effort floor; no later version exists at the time of this
audit. Re-evaluate quarterly.

**Why we accept the residual risk:**

- The renderer at `src/lib/templates/docx.ts` is the only call site.
- It parses **only** files in `templates/` — repo-shipped, reviewed
  templates. No user-supplied DOCX is ever passed through.
- Attachment uploads at `/api/consultations/[id]/attachments` go to
  object storage **without** being parsed.

If a future feature ever opens user-supplied DOCX through docxtemplater,
the trust boundary breaks and this acceptance no longer applies. See
`templates/README.md` for the trust note.

**Long-term remediation (deferred):** replace the docxtemplater stack
with the `docx` library (already in `dependencies`). Eliminates the
entire `xmldom` dependency tree at the cost of rewriting every clinical
template as code. Estimated 2–3 dev-weeks; defer until a maintained
fork of `docxtemplater-image-module-free` does not emerge by Q1 2027.

Reference: `review/audit-2026-06-06.md` F-014.
