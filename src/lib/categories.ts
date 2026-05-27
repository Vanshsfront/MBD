// MBD Clinic OS — service categories the patient picks at intake (PRD §2).
//
// `key` is what we store in IntakeForm.selectedCategories (JSON array).
// `label` is what the patient sees on the form and what shows in the rendered
// consent DOCX. `department` maps to Department.name for the assignment-step
// therapist filter (PRD §6.6).

export const SERVICE_CATEGORIES = [
  { key: "painInjury", label: "Pain / Injury", department: null /* mixed referral */ },
  { key: "physiotherapy", label: "Physiotherapy", department: "Physiotherapy" },
  { key: "strengthConditioning", label: "Strength & Conditioning", department: "S&C" },
  { key: "massage", label: "Sports / Deep Tissue / Massage Therapy", department: "Massage" },
  { key: "yoga", label: "Wellness Yoga", department: "Yoga" },
  { key: "nutrition", label: "Nutrition Guidance", department: "Nutrition" },
  { key: "counselling", label: "Counselling / Stress Support", department: "Counselling" },
  { key: "prevention", label: "Preventive / Wellness Consultation", department: "Medical" },
] as const;

export type ServiceCategoryKey = (typeof SERVICE_CATEGORIES)[number]["key"];

export const CATEGORY_KEYS: ServiceCategoryKey[] = SERVICE_CATEGORIES.map((c) => c.key);

export function departmentsForCategories(keys: readonly ServiceCategoryKey[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    const cat = SERVICE_CATEGORIES.find((c) => c.key === k);
    if (cat?.department) out.add(cat.department);
  }
  return Array.from(out);
}

/**
 * Reverse lookup: given a department name (Staff.department.name), return the
 * patient-facing category labels that route to that department. Lets the
 * assignment UI explain "Devanshi appears because she does Physiotherapy".
 */
export function categoriesForDepartment(department: string | null): {
  key: ServiceCategoryKey;
  label: string;
}[] {
  if (!department) return [];
  return SERVICE_CATEGORIES.filter((c) => c.department === department).map((c) => ({
    key: c.key,
    label: c.label,
  }));
}
