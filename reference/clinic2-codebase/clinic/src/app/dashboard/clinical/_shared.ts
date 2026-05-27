// Shared helpers for the per-template clinical record pages (counselling, yoga, fab).
// Each page owns its own fields — these helpers cover what they share:
//   - patient search filtered by the signed-in doctor's assigned clients
//   - service list filtered by the department matching the template
//   - history load via GET /api/consultations?type=<template>
//   - save via POST /api/consultations

export type TemplateKey = "counselling" | "yoga" | "fab" | "physician" | "physiotherapy";

export const TEMPLATE_DEPARTMENT: Record<TemplateKey, string> = {
  counselling: "Counselling",
  yoga: "Yoga",
  fab: "Strength & Conditioning",
  physician: "Medical",
  physiotherapy: "Physiotherapy",
};

export const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  counselling: "Counselling Record",
  yoga: "Wellness Yoga Record",
  fab: "Functional Assessment Battery",
  physician: "Physician Consultation",
  physiotherapy: "Physiotherapy Consultation",
};

/** Map a staff member's department name to the correct clinical-record template. */
export function departmentToTemplate(departmentName: string): TemplateKey {
  const lower = departmentName.toLowerCase();
  if (lower.includes("counsel")) return "counselling";
  if (lower.includes("yoga")) return "yoga";
  if (lower.includes("strength") || lower.includes("conditioning")) return "fab";
  if (lower.includes("physio")) return "physiotherapy";
  // Medical / Physician / Owner / Admin → physician template
  return "physician";
}

export interface ClientLite {
  id: string; clientCode: string; firstName: string; lastName: string;
  phone: string; age?: number | null; sex?: string | null;
}

export interface ServiceLite { id: string; name: string; basePrice: number; department: { name: string } | null }

export interface ConsultationItem {
  id: string;
  date: string;
  chiefComplaints: string | null;
  diagnosis: string | null;
  planOfCare: string | null;
  followUp: string | null;
  assessmentNotes: string | null;
  client: { id: string; firstName: string; lastName: string; clientCode: string };
  consultant: { name: string };
  service: { name: string };
}

export function parseNotes(notes: string | null): Record<string, unknown> {
  if (!notes) return {};
  try { return JSON.parse(notes) as Record<string, unknown>; } catch { return {}; }
}
