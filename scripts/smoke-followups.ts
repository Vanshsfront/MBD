// Render each follow-up + first-visit consultation + new intake template
// with sample data + convert one to PDF. Confirms placeholder injection +
// row-loop tags + signature image embed all work end-to-end.

import { promises as fs } from "node:fs";
import path from "node:path";

import { renderDocxTemplate } from "../src/lib/templates/docx";
import type { DocxTemplateKey } from "../src/lib/templates/keys";

const OUT = path.join(process.cwd(), "tmp", "smoke");

const COMMON = {
  visitDate: "07 May 2026",
  patient: {
    name: "Aarav Mehta",
    code: "COL-MBD-0031",
    age: "34",
    sex: "M",
    dominance: "Right",
    phone: "+91 98200 11122",
    email: "aarav.mehta@example.in",
    occupation: "Software Engineer",
    sport: "Cycling",
    address: "Flat 4B, Sea Breeze Apartments, Colaba, Mumbai 400005",
    maritalStatus: "Married",
  },
  emergency: {
    name: "Saanvi Mehta",
    phone: "+91 98201 11122",
    relationship: "spouse",
  },
  therapist: { name: "Dr. Devanshi Vira" },
  vitals: {
    weightKg: "78",
    heightCm: "178",
    bmi: "24.6",
    spo2: "98",
    spo2Device: "finger",
    pulseBpm: "72",
    bp: "122/80",
  },
  c: {
    dm: "☐",
    htn: "☐",
    cad: "☐",
    pcos: "☐",
    thyroid: "☐",
    otherFlag: "☐",
    otherText: "",
    thyroidEnd: "",
  },
  // Lab + imaging + ref checkbox payloads for the consultation templates.
  lab: { cbc: "☐", rft: "☐", lft: "☐", tft: "☐", lipid: "☐", cmp: "☐", hba1c: "☐", urinalysis: "☐" },
  imaging: { xray: "☐", mri: "☑", ct: "☐", usg: "☐", ecg: "☐", dexa: "☐" },
  ref: { physiotherapy: "☑", sc: "☐", massage: "☐", nutrition: "☐", counselling: "☐", yoga: "☐" },
  wellnessProgram: { yes: "☑", no: "☐" },
  hpi: "Lower back pain ~3 months, gradual onset, worsens after long cycling rides.",
  pastMedicalHistory: "Mild hypertension, controlled.",
  pastSurgicalHistory: "None.",
  familyHistory: "Father — diabetic.",
  personalHistory: "Non-smoker, occasional drinker.",
  personal: { sleep: "6h", appetite: "good", bowelBladder: "regular", others: "Sedentary 9-5" },
  diagnosis: "Mechanical low back pain, suspected paraspinal myofascial.",
  currentMedications: "Pantop 40 mg PRN.",
  planOfCare: "PT 2×/week × 6 wk, gradual return to cycling.",
  followUp: "Review in 4 weeks.",
  investigations: "MRI lumbar spine.",
  posture: {
    summary: "Forward head posture, increased lumbar lordosis.",
    anterior: "Symmetric shoulders.",
    lateral: "FHP +1 cm.",
    posterior: "Mild scoliosis at T7.",
  },
  pain: {
    aggravating: "Long sitting, forward bending.",
    relieving: "Lying supine, lumbar extension.",
  },
  functionalAssessment: "Squat to 90°, Bird-Dog L>R unsteady.",
  specialTestsSummary: "Slump test +ve right.",
  differentialDiagnosis: "Discogenic vs facet joint.",
  girthRows: [
    { index: "1", site: "Mid-thigh", right: "52 cm", left: "53 cm" },
    { index: "2", site: "Calf", right: "38 cm", left: "39 cm" },
  ],
  tightnessRows: [
    { muscleGroup: "Hamstrings", mild: "", moderate: "☑", severe: "", right: "+", left: "+" },
    { muscleGroup: "Hip flexors", mild: "☑", moderate: "", severe: "", right: "+", left: "" },
  ],
  romRows: [
    { index: "1", joint: "Lumbar", movement: "Flexion", right: "60°", left: "60°", endFeel: "firm" },
    { index: "2", joint: "Hip", movement: "Extension", right: "10°", left: "8°", endFeel: "firm" },
  ],
  mmtRows: [
    { index: "1", joint: "Hip", muscleGroup: "Glute med", right: "4/5", left: "3/5" },
    { index: "2", joint: "Knee", muscleGroup: "Quad", right: "5/5", left: "5/5" },
  ],
  neuroRows: [
    { index: "1", component: "L4 sensory", right: "intact", left: "intact", equality: "=" },
    { index: "2", component: "L5 motor", right: "5/5", left: "4/5", equality: "<" },
  ],
  patientSignature: "",
  consultantSignature: "",
  fmsRows: [
    { index: "1", test: "Deep squat", score: "2", notes: "Heels rise" },
    { index: "2", test: "Hurdle step", score: "2", notes: "Pelvic drop right" },
  ],
  strengthRows: [
    { test: "Goblet squat 3RM", right: "60 kg", left: "60 kg", notes: "Even" },
  ],
  powerRows: [
    { test: "Standing broad jump", trial1: "1.9 m", trial2: "2.0 m", best: "2.0 m" },
  ],
  cardioRows: [
    { test: "12-min run", result: "2.4 km", notes: "RPE 7" },
  ],
  findings: {
    strengths: "Posterior chain.",
    limitations: "Hip mobility.",
    risks: "Discogenic if loaded poorly.",
    programme: "Phase 1 mobility + isometrics 4 wk.",
  },
  // Yoga / counselling intake fields.
  yogaExperience: "Beginner — 6 months casual home practice.",
  activityRoutine: "Cycling 30 km/week, walks daily.",
  chronicConditions: "—",
  recentInjuries: "—",
  stressSleep: "5/10 stress, 6h sleep.",
  dietPattern: "Vegetarian, 3 meals/day.",
  presentingConcern: "Anxiety + work stress.",
  onsetTriggers: "Past 6 months, project deadlines.",
  severityImpact: "6/10, sleep disrupted.",
  priorTherapy: "None.",
  mh: { mood: "low", sleep: "interrupted", appetite: "normal", alcohol: "☐", tobacco: "☐", other: "☐", otherText: "" },
  riskNotes: "No SI/HI.",
  secondaryGoals: "Better sleep.",
  p: { individual: "☑", duo: "☐", group: "☐", online: "☐", timePreference: "Morning" },
  specialRequests: "—",
  consent: { truth: "☑", cancellation: "☑", liability: "☑", confidentiality: "☑" },
  chiefComplaint: "Lower back pain, intermittent over 3 months",
  primaryGoal: "Pain relief + return to cycling 30 km/week",
  knownAllergies: "None",
  injuries: "Mild ACL strain in 2024 (resolved)",
  sessions: [
    {
      sessionNumber: "1",
      date: "01 Apr 2026",
      ptRx: "Manual therapy + lumbar mobility",
      modality: "—",
      notes: "Manual therapy + lumbar mobility",
      topic: "Initial assessment",
      yogaSession: "Restorative yoga, 45 min",
      exercises: "Squat 3×8 / RDL 3×8",
      load: "60 kg",
      volume: "24",
      rpe: "7",
      remark: "Tolerated well",
      sign: "DV",
    },
    {
      sessionNumber: "2",
      date: "10 Apr 2026",
      ptRx: "Strengthening + cupping",
      modality: "Cupping",
      notes: "Strengthening + cupping",
      topic: "Coping strategies",
      yogaSession: "Vinyasa, 60 min",
      exercises: "Squat 3×10 / RDL 3×10",
      load: "65 kg",
      volume: "30",
      rpe: "7",
      remark: "Reduced pain ~40%",
      sign: "DV",
    },
    {
      sessionNumber: "3",
      date: "20 Apr 2026",
      ptRx: "Progressive loading",
      modality: "K-Tape",
      notes: "Progressive loading",
      topic: "Stress management",
      yogaSession: "Sound bath, 30 min",
      exercises: "Squat 3×12",
      load: "70 kg",
      volume: "36",
      rpe: "8",
      remark: "Functional gains",
      sign: "DV",
    },
  ],
};

async function renderAndSave(key: DocxTemplateKey, suffix: string) {
  const buf = await renderDocxTemplate(key, COMMON);
  await fs.writeFile(path.join(OUT, `followup-${suffix}.docx`), buf);
  return buf;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  await renderAndSave("physiotherapy-followup", "physio");
  await renderAndSave("physician-followup", "physician");
  await renderAndSave("counselling-followup", "counselling");
  await renderAndSave("nutrition-followup", "nutrition");
  await renderAndSave("yoga-followup", "yoga");
  await renderAndSave("sc-followup", "sc");

  // First-visit consultations (Phase 1) — placeholders injected into the
  // client's original DOCX templates.
  await renderAndSave("physician", "physician-consult");
  await renderAndSave("physiotherapy", "physiotherapy-consult");

  // New DOCX rebuilds of the PDF-only intake forms.
  await renderAndSave("yoga-intake", "yoga-intake");
  await renderAndSave("counselling-intake", "counselling-intake");
  await renderAndSave("fab", "fab");

  console.log(
    "[smoke-followups] 6 follow-ups + 2 first-visit consultations + 3 intake rebuilds rendered.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
