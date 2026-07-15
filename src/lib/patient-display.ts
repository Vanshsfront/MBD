export const PATIENT_TITLES = ["Mr", "Mrs", "Ms", "Mstr"] as const;

export type PatientTitle = (typeof PATIENT_TITLES)[number];

export function isPatientTitle(value: unknown): value is PatientTitle {
  return typeof value === "string" && PATIENT_TITLES.includes(value as PatientTitle);
}

export function formatPatientName(input: {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  return input.title ? `${input.title}. ${name}`.trim() : name;
}
