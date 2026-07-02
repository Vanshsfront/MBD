// Per-template zod schemas + TS types for Consultation.formData.
//
// PRD §6.1 / Revamp Phase 4. The shape each form persists must align with the
// placeholders the DOCX template expects (see scripts/inject-placeholders.ts
// + scripts/build-new-templates.ts). The render route spreads formData onto
// the docxtemplater render context.
//
// Notes on field placement:
// - Top-level Consultation columns (chiefComplaints / diagnosis / planOfCare /
//   followUp / recommendedSessions / treatmentProtocol) are kept off formData
//   so reports can index on them. The render route reads them from the
//   Consultation row + spreads formData on top.
// - `recommendedServicesJson` (Phase 0 column) holds the staged service mix
//   the FO converts into a Package. NOT in formData; saved alongside.

import { z } from "zod";
import type { DocxTemplateKey } from "@/lib/templates/keys";

// ───────── Shared building blocks ─────────

const checkbox = z.string().default("☐"); // "☑" or "☐"

const VitalsSchema = z
  .object({
    weightKg: z.string().default(""),
    heightCm: z.string().default(""),
    bmi: z.string().default(""),
    spo2: z.string().default(""),
    spo2Device: z.string().default(""),
    pulseBpm: z.string().default(""),
    bp: z.string().default(""),
  })
  .partial();

const ComorbiditiesSchema = z
  .object({
    dm: checkbox,
    htn: checkbox,
    cad: checkbox,
    pcos: checkbox,
    thyroid: checkbox,
    otherFlag: checkbox,
    otherText: z.string().default(""),
    thyroidEnd: z.string().default(""),
  })
  .partial();

const PersonalHistorySchema = z
  .object({
    sleep: z.string().default(""),
    appetite: z.string().default(""),
    bowelBladder: z.string().default(""),
    others: z.string().default(""),
  })
  .partial();

// ───────── Follow-up row shapes (PRD §6.1 row-loops) ─────────

const PhysioFollowupRowSchema = z
  .object({
    sessionNumber: z.string().default(""),
    date: z.string().default(""),
    ptRx: z.string().default(""),
    modality: z.string().default(""),
    remark: z.string().default(""),
    sign: z.string().default(""),
  })
  .partial();

const PhysicianFollowupRowSchema = z
  .object({
    sessionNumber: z.string().default(""),
    date: z.string().default(""),
    notes: z.string().default(""),
    remark: z.string().default(""),
    sign: z.string().default(""),
  })
  .partial();

const SCFollowupRowSchema = z
  .object({
    sessionNumber: z.string().default(""),
    date: z.string().default(""),
    exercises: z.string().default(""),
    load: z.string().default(""),
    volume: z.string().default(""),
    rpe: z.string().default(""),
    remark: z.string().default(""),
    sign: z.string().default(""),
  })
  .partial();

const YogaFollowupRowSchema = z
  .object({
    sessionNumber: z.string().default(""),
    date: z.string().default(""),
    yogaSession: z.string().default(""),
    remark: z.string().default(""),
    sign: z.string().default(""),
  })
  .partial();

// ───────── Physiotherapy first-visit examination tables ─────────

const GirthRowSchema = z
  .object({
    index: z.string().default(""),
    site: z.string().default(""),
    right: z.string().default(""),
    left: z.string().default(""),
  })
  .partial();

const TightnessRowSchema = z
  .object({
    muscleGroup: z.string().default(""),
    mild: checkbox,
    moderate: checkbox,
    severe: checkbox,
    right: z.string().default(""),
    left: z.string().default(""),
  })
  .partial();

const RomRowSchema = z
  .object({
    index: z.string().default(""),
    joint: z.string().default(""),
    movement: z.string().default(""),
    right: z.string().default(""),
    left: z.string().default(""),
    endFeel: z.string().default(""),
  })
  .partial();

const MmtRowSchema = z
  .object({
    index: z.string().default(""),
    joint: z.string().default(""),
    muscleGroup: z.string().default(""),
    right: z.string().default(""),
    left: z.string().default(""),
  })
  .partial();

const NeuroRowSchema = z
  .object({
    index: z.string().default(""),
    component: z.string().default(""),
    right: z.string().default(""),
    left: z.string().default(""),
    equality: z.string().default(""),
  })
  .partial();

// ───────── FAB tables ─────────

const FmsRowSchema = z
  .object({
    index: z.string().default(""),
    test: z.string().default(""),
    score: z.string().default(""),
    notes: z.string().default(""),
  })
  .partial();

const StrengthRowSchema = z
  .object({
    test: z.string().default(""),
    right: z.string().default(""),
    left: z.string().default(""),
    notes: z.string().default(""),
  })
  .partial();

const PowerRowSchema = z
  .object({
    test: z.string().default(""),
    trial1: z.string().default(""),
    trial2: z.string().default(""),
    best: z.string().default(""),
  })
  .partial();

const CardioRowSchema = z
  .object({
    test: z.string().default(""),
    result: z.string().default(""),
    notes: z.string().default(""),
  })
  .partial();

// ───────── Per-template form schemas ─────────

const PhysiotherapyFollowupSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    comorbidities: ComorbiditiesSchema.optional(),
    knownAllergies: z.string().default(""),
    sessions: z.array(PhysioFollowupRowSchema).default([]),
    sessionsPage2: z.array(PhysioFollowupRowSchema).default([]),
  })
  .partial();

const PhysicianFollowupSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    comorbidities: ComorbiditiesSchema.optional(),
    knownAllergies: z.string().default(""),
    primaryGoal: z.string().default(""),
    sessions: z.array(PhysicianFollowupRowSchema).default([]),
    sessionsPage2: z.array(PhysicianFollowupRowSchema).default([]),
  })
  .partial();

const CounsellingFollowupSchema = z
  .object({
    primaryGoal: z.string().default(""),
    sessions: z.array(PhysicianFollowupRowSchema).default([]),
    sessionsPage2: z.array(PhysicianFollowupRowSchema).default([]),
  })
  .partial();

const NutritionFollowupSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    comorbidities: ComorbiditiesSchema.optional(),
    primaryGoal: z.string().default(""),
    sessions: z.array(PhysicianFollowupRowSchema).default([]),
    sessionsPage2: z.array(PhysicianFollowupRowSchema).default([]),
  })
  .partial();

const YogaFollowupSchema = z
  .object({
    primaryGoal: z.string().default(""),
    sessions: z.array(YogaFollowupRowSchema).default([]),
    sessionsPage2: z.array(YogaFollowupRowSchema).default([]),
  })
  .partial();

const SCFollowupSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    comorbidities: ComorbiditiesSchema.optional(),
    primaryGoal: z.string().default(""),
    injuries: z.string().default(""),
    sessions: z.array(SCFollowupRowSchema).default([]),
    sessionsPage2: z.array(SCFollowupRowSchema).default([]),
  })
  .partial();

const PhysicianConsultationSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    comorbidities: ComorbiditiesSchema.optional(),
    knownAllergies: z.string().default(""),
    pastMedicalHistory: z.string().default(""),
    pastSurgicalHistory: z.string().default(""),
    familyHistory: z.string().default(""),
    personalHistory: z.string().default(""),
    personal: PersonalHistorySchema.optional(),
    currentMedications: z.string().default(""),
    lab: z
      .object({
        cbc: checkbox,
        rft: checkbox,
        lft: checkbox,
        tft: checkbox,
        lipid: checkbox,
        cmp: checkbox,
        hba1c: checkbox,
        urinalysis: checkbox,
      })
      .partial()
      .optional(),
    imaging: z
      .object({
        xray: checkbox,
        mri: checkbox,
        ct: checkbox,
        usg: checkbox,
        ecg: checkbox,
        dexa: checkbox,
      })
      .partial()
      .optional(),
    ref: z
      .object({
        physiotherapy: checkbox,
        sc: checkbox,
        massage: checkbox,
        nutrition: checkbox,
        counselling: checkbox,
        yoga: checkbox,
      })
      .partial()
      .optional(),
    wellnessProgram: z
      .object({ yes: checkbox, no: checkbox })
      .partial()
      .optional(),
  })
  .partial();

const PhysiotherapyConsultationSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    comorbidities: ComorbiditiesSchema.optional(),
    knownAllergies: z.string().default(""),
    hpi: z.string().default(""),
    pastMedicalHistory: z.string().default(""),
    pastSurgicalHistory: z.string().default(""),
    familyHistory: z.string().default(""),
    personalHistory: z.string().default(""),
    personal: PersonalHistorySchema.optional(),
    investigations: z.string().default(""),
    currentMedications: z.string().default(""),
    posture: z
      .object({
        summary: z.string().default(""),
        anterior: z.string().default(""),
        lateral: z.string().default(""),
        posterior: z.string().default(""),
      })
      .partial()
      .optional(),
    pain: z
      .object({
        aggravating: z.string().default(""),
        relieving: z.string().default(""),
      })
      .partial()
      .optional(),
    functionalAssessment: z.string().default(""),
    specialTestsSummary: z.string().default(""),
    differentialDiagnosis: z.string().default(""),
    girthRows: z.array(GirthRowSchema).default([]),
    tightnessRows: z.array(TightnessRowSchema).default([]),
    romRows: z.array(RomRowSchema).default([]),
    mmtRows: z.array(MmtRowSchema).default([]),
    neuroRows: z.array(NeuroRowSchema).default([]),
  })
  .partial();

const YogaIntakeSchema = z
  .object({
    primaryGoal: z.string().default(""),
    yogaExperience: z.string().default(""),
    activityRoutine: z.string().default(""),
    chronicConditions: z.string().default(""),
    recentInjuries: z.string().default(""),
    stressSleep: z.string().default(""),
    dietPattern: z.string().default(""),
    p: z
      .object({
        individual: checkbox,
        duo: checkbox,
        group: checkbox,
        online: checkbox,
        timePreference: z.string().default(""),
      })
      .partial()
      .optional(),
    specialRequests: z.string().default(""),
    consent: z
      .object({
        truth: checkbox,
        cancellation: checkbox,
        liability: checkbox,
      })
      .partial()
      .optional(),
  })
  .partial();

const CounsellingIntakeSchema = z
  .object({
    presentingConcern: z.string().default(""),
    onsetTriggers: z.string().default(""),
    severityImpact: z.string().default(""),
    priorTherapy: z.string().default(""),
    mh: z
      .object({
        mood: z.string().default(""),
        sleep: z.string().default(""),
        appetite: z.string().default(""),
        alcohol: checkbox,
        tobacco: checkbox,
        other: checkbox,
        otherText: z.string().default(""),
      })
      .partial()
      .optional(),
    riskNotes: z.string().default(""),
    primaryGoal: z.string().default(""),
    secondaryGoals: z.string().default(""),
    consent: z
      .object({
        confidentiality: checkbox,
        cancellation: checkbox,
        truth: checkbox,
      })
      .partial()
      .optional(),
  })
  .partial();

const FabSchema = z
  .object({
    vitals: VitalsSchema.optional(),
    fmsRows: z.array(FmsRowSchema).default([]),
    strengthRows: z.array(StrengthRowSchema).default([]),
    powerRows: z.array(PowerRowSchema).default([]),
    cardioRows: z.array(CardioRowSchema).default([]),
    findings: z
      .object({
        strengths: z.string().default(""),
        limitations: z.string().default(""),
        risks: z.string().default(""),
        programme: z.string().default(""),
      })
      .partial()
      .optional(),
  })
  .partial();

const CommonIntakeSchema = z.object({}).partial();

// ───────── Registry ─────────

export const CLINICAL_SCHEMAS: Record<DocxTemplateKey, z.ZodTypeAny> = {
  "common-intake": CommonIntakeSchema,
  physician: PhysicianConsultationSchema,
  physiotherapy: PhysiotherapyConsultationSchema,
  "physician-followup": PhysicianFollowupSchema,
  "physiotherapy-followup": PhysiotherapyFollowupSchema,
  "sc-followup": SCFollowupSchema,
  "yoga-followup": YogaFollowupSchema,
  "counselling-followup": CounsellingFollowupSchema,
  "nutrition-followup": NutritionFollowupSchema,
  "yoga-intake": YogaIntakeSchema,
  "counselling-intake": CounsellingIntakeSchema,
  fab: FabSchema,
};

// ───────── Recommendations (separate from formData; lives on
//           Consultation.recommendedServicesJson) ─────────

export const RecommendationItemSchema = z.object({
  serviceId: z.string().min(1),
  serviceName: z.string().min(1),
  count: z.number().int().min(1).max(200),
  perAmount: z.number().nonnegative().optional(),
  gstRate: z.number().nonnegative().max(1).optional(),
});
export type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const RecommendationsSchema = z.array(RecommendationItemSchema).max(50);

// ───────── Advisory Recommendations (separate from formData; lives on
//           Consultation.advisoryRecommendations) ─────────

export const AdvisoryRecommendationsSchema = z
  .object({
    physiotherapy: z.boolean().default(false),
    nutrition: z.boolean().default(false),
    counselling: z.boolean().default(false),
    sc: z.boolean().default(false),
    yoga: z.boolean().default(false),
    massage: z.boolean().default(false),
  })
  .partial();
export type AdvisoryRecommendations = z.infer<typeof AdvisoryRecommendationsSchema>;

// ───────── Type exports per template ─────────

export type PhysiotherapyConsultationData = z.infer<typeof PhysiotherapyConsultationSchema>;
export type PhysicianConsultationData = z.infer<typeof PhysicianConsultationSchema>;
export type PhysiotherapyFollowupData = z.infer<typeof PhysiotherapyFollowupSchema>;
export type PhysicianFollowupData = z.infer<typeof PhysicianFollowupSchema>;
export type SCFollowupData = z.infer<typeof SCFollowupSchema>;
export type YogaFollowupData = z.infer<typeof YogaFollowupSchema>;
export type CounsellingFollowupData = z.infer<typeof CounsellingFollowupSchema>;
export type NutritionFollowupData = z.infer<typeof NutritionFollowupSchema>;
export type YogaIntakeData = z.infer<typeof YogaIntakeSchema>;
export type CounsellingIntakeData = z.infer<typeof CounsellingIntakeSchema>;
export type FabData = z.infer<typeof FabSchema>;

// Discriminated helper: classify a templateKey as consultation / followup / intake.
export function isFirstVisitTemplate(key: DocxTemplateKey): boolean {
  return (
    key === "physician" ||
    key === "physiotherapy" ||
    key === "yoga-intake" ||
    key === "counselling-intake" ||
    key === "fab"
  );
}
export function isFollowupTemplate(key: DocxTemplateKey): boolean {
  return key.endsWith("-followup");
}

/**
 * Resolve which template a given client+department combination should show.
 * - First visit: the first-visit template for the department (e.g. physiotherapy)
 *   if no prior Consultation exists, OR the followup template if there is one.
 * - Massage: returns null (PRD §4 B4 — no clinical record).
 *
 * Caller must pass the `priorCount` of consultations for this client across
 * BOTH the first-visit and follow-up templates of the department.
 */
export function resolveClinicalTemplate(
  department: string | null,
  priorCount: number,
): DocxTemplateKey | null {
  if (!department) return null;
  switch (department) {
    case "Medical":
      return priorCount === 0 ? "physician" : "physician-followup";
    case "Physiotherapy":
      return priorCount === 0 ? "physiotherapy" : "physiotherapy-followup";
    case "Yoga":
      return priorCount === 0 ? "yoga-intake" : "yoga-followup";
    case "Counselling":
      return priorCount === 0 ? "counselling-intake" : "counselling-followup";
    case "Nutrition":
      // Nutrition has only a follow-up template in §6.1; first visit is also
      // captured there with vitals + first session row.
      return "nutrition-followup";
    case "S&C":
      // FAB battery on first visit; follow-up sheet thereafter.
      return priorCount === 0 ? "fab" : "sc-followup";
    case "Massage":
      return null;
    default:
      return null;
  }
}

/**
 * Companion helper for the render route: turn the relevant templates into a
 * pair (intake/consultation + followup) so we can count priors across both.
 */
export function relatedTemplateKeys(key: DocxTemplateKey): DocxTemplateKey[] {
  if (key === "physician" || key === "physician-followup") return ["physician", "physician-followup"];
  if (key === "physiotherapy" || key === "physiotherapy-followup")
    return ["physiotherapy", "physiotherapy-followup"];
  if (key === "yoga-intake" || key === "yoga-followup") return ["yoga-intake", "yoga-followup"];
  if (key === "counselling-intake" || key === "counselling-followup")
    return ["counselling-intake", "counselling-followup"];
  if (key === "fab" || key === "sc-followup") return ["fab", "sc-followup"];
  return [key];
}
