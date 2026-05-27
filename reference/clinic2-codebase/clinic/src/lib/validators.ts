import { z } from "zod";

// ── Visit Reason Options ────────────────────────────────

export const VISIT_REASON_OPTIONS = [
  "Pain/Injury",
  "Physiotherapy",
  "Strength Conditioning & Training",
  "Sports/Deep Tissue/Massage Therapy",
  "Wellness Yoga",
  "Nutrition Guidance",
  "Counselling & Stress Support",
  "Preventive Wellness Consultation",
  "Others",
] as const;

// ── Service Choice Options (Patient Intake Step 2) ─────
export const SERVICE_CHOICE_OPTIONS = [
  "Counselling",
  "Massage",
  "Medical Consultation",
  "Nutrition Consultation",
  "Physiotherapy",
  "Strength & Conditioning",
  "Yoga",
] as const;

// ── Client Intake ────────────────────────────────────────

export const clientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required").min(1, "Email is required"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  dob: z.string().optional(),
  age: z.coerce.number().min(0).max(100, "Age must be between 0 and 100").optional(),
  sex: z.string().optional(),
  dominance: z.string().optional(),
  address: z.object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    pincode: z.string().optional(),
  }).optional(),
  emergencyContact: z.object({
    name: z.string().optional(),
    phone: z.string().regex(/^\d{10}$/, "Must be exactly 10 digits").optional().or(z.literal("")),
  }).optional(),
  referredBy: z.string().optional(),
  preferredTherapistId: z.string().optional(),
  visitReasons: z.array(z.string()).optional(),
});

// ── Patient-Facing Intake (simplified form) ─────────────

export const patientIntakeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  dob: z.string().min(1, "Date of birth is required"),
  age: z.coerce.number().min(0).max(100, "Age must be between 0 and 100"),
  sex: z.string().optional(),
  address: z.object({
    line1: z.string().min(1, "Address line 1 is required"),
    line2: z.string().optional(),
    city: z.string().min(1, "City is required"),
    pincode: z.string().regex(/^\d{6}$/, "Pincode must be 6 digits"),
  }),
  emergencyContact: z.object({
    name: z.string().min(1, "Emergency contact name is required"),
    phone: z.string().regex(/^\d{10}$/, "Emergency contact phone must be exactly 10 digits"),
  }),
  visitReasons: z.array(z.string()).min(1, "Select at least one reason for your visit"),
});

export const intakeFormSchema = z.object({
  selectedServices: z.array(z.string()).min(1, "Select at least one service"),
  consentSigned: z.boolean().refine((v) => v === true, "Consent is required"),
  liabilityWaiverSigned: z.boolean().refine((v) => v === true, "Waiver is required"),
  commercialTermsAccepted: z.boolean().refine((v) => v === true, "Terms acceptance required"),
  cancellationPolicyAcknowledged: z.boolean().refine((v) => v === true, "Policy acknowledgement required"),
});

// ── Medical History / Physician Consultation ─────────────

export const vitalsSchema = z.object({
  weight: z.coerce.number().optional(),
  height: z.coerce.number().optional(),
  bmi: z.coerce.number().optional(),
  pulseRate: z.coerce.number().optional(),
  spo2: z.coerce.number().optional(),
  spo2On: z.string().optional(),
  bpSystolic: z.coerce.number().optional(),
  bpDiastolic: z.coerce.number().optional(),
});

export const comorbiditiesSchema = z.object({
  dm: z.boolean().default(false),
  htn: z.boolean().default(false),
  cad: z.boolean().default(false),
  pcos: z.boolean().default(false),
  thyroid: z.boolean().default(false),
  thyroidHypo: z.boolean().default(false),
  thyroidHyper: z.boolean().default(false),
  other: z.boolean().default(false),
  otherDetails: z.string().optional(),
}).passthrough();

export const medicalHistorySchema = z.object({
  vitals: vitalsSchema.optional(),
  comorbidities: comorbiditiesSchema.optional(),
  knownAllergies: z.string().optional(),
  chiefComplaints: z.string().optional(),
  pastMedicalHistory: z.string().optional(),
  pastSurgicalHistory: z.string().optional(),
  familyHistory: z.string().optional(),
  personalHistory: z.object({
    sleep: z.string().optional(),
    diet: z.string().optional(),
    bowelBladder: z.string().optional(),
    others: z.string().optional(),
  }).optional(),
  diagnosis: z.string().optional(),
  currentMedications: z.string().optional(),
  planOfCare: z.string().optional(),
  followUp: z.string().optional(),
});

// ── Consultation ─────────────────────────────────────────

export const consultationSchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
  consultantId: z.string().min(1),
  vitals: vitalsSchema.optional(),
  comorbidities: comorbiditiesSchema.optional(),
  chiefComplaints: z.string().optional(),
  diagnosis: z.string().optional(),
  planOfCare: z.string().optional(),
  treatmentProtocol: z.string().optional(),
  recommendedSessions: z.coerce.number().min(1).optional(),
  assessmentNotes: z.any().optional(),
  followUp: z.string().optional(),
});

// ── Session ──────────────────────────────────────────────

export const sessionSchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
  therapistId: z.string().min(1),
  packageId: z.string().optional(),
  sessionDate: z.string().min(1),
  treatmentNotes: z.string().optional(),
  progressUpdates: z.string().optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"]).default("SCHEDULED"),
  allotments: z.array(z.object({
    therapistId: z.string(),
    therapistName: z.string(),
    serviceId: z.string(),
    serviceName: z.string(),
  })).optional(),
});

// ── Invoice ──────────────────────────────────────────────

export const invoiceLineItemSchema = z.object({
  service: z.string(),
  consultant: z.string(),
  hsnSac: z.string().optional(),
  sessions: z.coerce.number().min(1),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  perSessionAmount: z.coerce.number().min(0),
  gstRate: z.coerce.number().min(0).max(1),
});

export const invoiceSchema = z.object({
  clientId: z.string().min(1),
  packageId: z.string().optional(),
  invoiceType: z.enum(["INVOICE", "PROFORMA"]).default("INVOICE"),
  lineItems: z.array(invoiceLineItemSchema).min(1),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  discountType: z.enum(["PERCENT", "FLAT"]).default("PERCENT"),
  dueDate: z.string().optional(),
  validTill: z.string().optional(),
  referredBy: z.string().optional(),
  sacNumber: z.string().optional(),
  hslNumber: z.string().optional(),
});

// ── Auth / Staff ─────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const staffSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["ADMIN", "MANAGER", "FRONT_OFFICE", "CONSULTANT", "THERAPIST"]),
  departmentId: z.string().optional(),
  designation: z.string().optional(),
});

export type ClientInput = z.infer<typeof clientSchema>;
export type PatientIntakeInput = z.infer<typeof patientIntakeSchema>;
export type IntakeFormInput = z.infer<typeof intakeFormSchema>;
export type MedicalHistoryInput = z.infer<typeof medicalHistorySchema>;
export type ConsultationInput = z.infer<typeof consultationSchema>;
export type SessionInput = z.infer<typeof sessionSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type StaffInput = z.infer<typeof staffSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ── Client Flag ──────────────────────────────────────────

export const clientFlagSchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["VIP", "CAUTION", "OVERDUE", "FOLLOWUP", "CUSTOM"]),
  label: z.string().min(1, "Label is required"),
  color: z.enum(["red", "yellow", "green", "blue", "purple"]).default("yellow"),
  notes: z.string().optional(),
});

// ── Inventory Item ───────────────────────────────────────

export const inventoryItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  category: z.enum(["EQUIPMENT", "CONSUMABLE", "SUPPLEMENT", "OTHER"]).optional(),
  unitPrice: z.coerce.number().min(0).default(0),
  gstRate: z.coerce.number().min(0).max(1).default(0),
  hsnSacCode: z.string().optional(),
  stock: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().min(0).default(0),
  serviceId: z.string().optional(),
});

export type ClientFlagInput = z.infer<typeof clientFlagSchema>;
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;
