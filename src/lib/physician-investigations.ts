// Change spec 10 — turns a physician consultation's lab / imaging selections
// into the text that prints inside the three yellow boxes on the consultation
// DOCX. Previously those boxes were static: every consultation printed the full
// preset list regardless of what the doctor actually ticked. Now the box shows
// only what was ordered, including the free-text "Other" entries and per-scan
// area detail added in specs 10 A/B.
//
// Checkbox values are the glyph strings "☑"/"☐" (see clinical-schemas.ts).

const LAB_LABELS: ReadonlyArray<[key: string, label: string]> = [
  ["cbc", "CBC"],
  ["rft", "Renal function"],
  ["lft", "Liver function"],
  ["tft", "Thyroid function"],
  ["lipid", "Lipid profile"],
  ["cmp", "CMP"],
  ["hba1c", "HbA1c"],
  ["urinalysis", "Urinalysis"],
];

const IMAGING_LABELS: ReadonlyArray<[key: string, label: string]> = [
  ["xray", "X-Ray"],
  ["mri", "MRI"],
  ["ct", "CT"],
  ["usg", "USG"],
  ["ecg", "ECG"],
  ["dexa", "DEXA"],
];

type Glyphs = Record<string, unknown> | undefined | null;

function ticked(group: Glyphs, key: string): boolean {
  return typeof group?.[key] === "string" && group[key] === "☑";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Lab investigations actually ordered, newline-joined. Empty string when
 * nothing was ordered — the box then prints blank, which reads as "no labs
 * ordered" rather than the old full-list-every-time.
 */
export function labInvestigationsText(formData: Record<string, unknown>): string {
  const lab = formData.lab as Glyphs;
  const lines = LAB_LABELS.filter(([k]) => ticked(lab, k)).map(([, label]) => label);
  const other = str(formData.labOther);
  if (other) lines.push(other);
  return lines.join("\n");
}

/**
 * Diagnostic imaging ordered, one per line, each with its area/detail in
 * parentheses when the doctor typed one ("X-Ray (chest)").
 */
export function diagnosticImagingText(formData: Record<string, unknown>): string {
  const imaging = formData.imaging as Glyphs;
  const detail = formData.imagingDetail as Glyphs;
  const lines = IMAGING_LABELS.filter(([k]) => ticked(imaging, k)).map(([k, label]) => {
    const area = str(detail?.[k]);
    return area ? `${label} (${area})` : label;
  });
  const other = str(formData.imagingOther);
  if (other) lines.push(other);
  return lines.join("\n");
}
