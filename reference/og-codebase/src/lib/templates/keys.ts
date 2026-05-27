// MBD Clinic OS — Template registry.
//
// Every clinical/intake form has a stable key. Keys map to filenames in
// /templates/. The same key drives:
//   - Consultation.templateKey column
//   - clinical record route (department -> templateKey)
//   - renderDocxTemplate(templateKey, data)

export const DOCX_TEMPLATES = {
  "common-intake": "COMMON_PATIENT_INTAKE_FORM.docx",
  physician: "PHYSICIAN_CONSULTATION.docx",
  physiotherapy: "PHYSIOTHERAPY_CONSULTATION.docx",
  "physician-followup": "PHYSICIAN_FOLLOW_UP.docx",
  "physiotherapy-followup": "PHYSIOTHERAPY_FOLLOW_UP.docx",
  "sc-followup": "SC_FOLLOW_UP.docx",
  "yoga-followup": "WELLNESS_YOGA_FOLLOW_UP.docx",
  "counselling-followup": "COUNSELLING_FOLLOW_UP.docx",
  "nutrition-followup": "NUTRITION_COUNSELLING_FOLLOW_UP.docx",
  // First-visit intake forms (rebuilt as DOCX from the client's PDF originals).
  "yoga-intake": "WELLNESS_YOGA_INTAKE.docx",
  "counselling-intake": "COUNSELLING_INTAKE.docx",
  fab: "FAB.docx",
} as const;

export type DocxTemplateKey = keyof typeof DOCX_TEMPLATES;

export const INVOICE_TEMPLATES = {
  services: "Invoice_Services.xlsx",
  products: "Invoice_Products.xlsx",
  manual: "Invoice_Manual.xlsx",
  proforma: "Invoice_Proforma.xlsx",
} as const;

export type InvoiceFlavor = keyof typeof INVOICE_TEMPLATES;

/**
 * Maps a department name (`Department.name`) to the consultation template key
 * a therapist in that department uses. Massage has no clinical record (PRD §4 B4).
 */
export function templateKeyForDepartment(
  departmentName: string | null | undefined,
): DocxTemplateKey | null {
  switch (departmentName) {
    case "Medical":
      return "physician";
    case "Physiotherapy":
      return "physiotherapy";
    case "Counselling":
      return "counselling-followup"; // intake form is PDF rebuild — Phase 2
    case "Yoga":
      return "yoga-followup";
    case "Nutrition":
      return "nutrition-followup";
    case "S&C":
      return "sc-followup";
    case "Massage":
      return null;
    default:
      return null;
  }
}
