# Templates

Source-of-truth files for clinical PDFs and invoices. **Never** redrawn in jsPDF (PRD §6.1).

## Clinical (DOCX → docxtemplater → optional PDF via LibreOffice)

| File | TemplateKey | Used by |
|---|---|---|
| `COMMON_PATIENT_INTAKE_FORM.docx` | `common-intake` | Walk-in intake (Journey A consent step) |
| `PHYSICIAN_CONSULTATION.docx` | `physician` | Medical CONSULTANT first visit |
| `PHYSIOTHERAPY_CONSULTATION.docx` | `physiotherapy` | Physiotherapy THERAPIST first visit |
| `PHYSICIAN_FOLLOW_UP.docx` | `physician-followup` | Medical follow-up (repeating visits) |
| `PHYSIOTHERAPY_FOLLOW_UP.docx` | `physiotherapy-followup` | Physio follow-up (repeating visits) |
| `SC_FOLLOW_UP.docx` | `sc-followup` | Strength & Conditioning sessions |
| `WELLNESS_YOGA_FOLLOW_UP.docx` | `yoga-followup` | Yoga sessions |
| `COUNSELLING_FOLLOW_UP.docx` | `counselling-followup` | Counselling sessions |
| `NUTRITION_COUNSELLING_FOLLOW_UP.docx` | `nutrition-followup` | Nutrition sessions |

### Placeholder syntax

`{{path.to.value}}` — single curly OR double. The renderer is configured for `{{ }}` (PRD-aligned) via `delimiters` in `src/lib/templates/docx.ts`. Repeating sections use the docxtemplater loop:

```
{{#followups}}
  Visit {{visitNumber}} — {{date}}
  Findings: {{findings}}
{{/followups}}
```

### Status of placeholder insertion

The DOCX files copied here are the client's originals. **Placeholders have not yet been inserted.** Phase 1's renderer infra is in place; the placeholder-injection pass runs as a one-time step (see `scripts/inject-placeholders.ts`, run before Phase 2 needs the consent form) using a deterministic anchor-text → placeholder mapping documented per template.

For each clinical template the placeholders to insert are documented inline in:

- `src/lib/templates/_placeholder-map.ts` — anchor-to-placeholder mapping per template
- This is the input the inject-placeholders script consumes.

## Invoices (XLSX → exceljs)

| File | Flavor | Notes |
|---|---|---|
| `Invoice_Services.xlsx` | `services` | VLOOKUP-driven from `ServiceTable` (MasterData sheet) |
| `Invoice_Products.xlsx` | `products` | VLOOKUP for HSN/SAC; per-piece price entered manually |
| `Invoice_Manual.xlsx` | `manual` | Free entry; only GST VLOOKUP |
| `Invoice_Proforma.xlsx` | `proforma` | Same as Services + valid-till field |

### Cell layout

- Header row 15: `B15` centre, `D15` client, `H15` invoice number, `K15` suffix
- Row 16: `H16` invoice date
- Row 17 (Proforma): `H17` valid-till
- Bank/PAN block: rows 20–25
- Line items: rows 28–53 (max 26 rows). Columns vary by flavor (see `src/lib/templates/xlsx.ts`).
- Totals: rows 54–58. Pre-existing template formulas (SUM, SUMPRODUCT, VLOOKUP) are preserved by the renderer.

## Caveats

- **Merged cells** in the DOCX clinical exam tables: docxtemplater loops must not span merge boundaries. Place loop tags around whole table rows.
- **VLOOKUPs** depend on a `ServiceTable` and `ProductTable` named range pointing to the MasterData sheet. The seed populates `Service` and `Product` tables — Excel-side MasterData is sourced from `/reference-material/formats/MBD Master Data (1).xlsx` and copied separately.
- **Checkboxes** in the COMMON intake form are rendered as `☑` / `☐` text characters via placeholders rather than Word form-field state, since docxtemplater can only do text substitution.
- **Patient signature** image is embedded via the docxtemplater image module (added later); for Phase 1, `{{signature}}` resolves to a text placeholder.
