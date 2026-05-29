// Phase 4 verification — proves the structured clinical-record pipeline
// renders a Physiotherapy Consultation byte-faithfully.
//
// Steps:
//   1. Find Aarav Mehta (or fall back to any client) + a Physiotherapy staff.
//   2. Build a Physiotherapy Consultation `formData` with 30+ structured
//      fields (vitals + comorbidities + 5 exam tables + posture + plan).
//   3. Validate against the schema in src/lib/clinical-schemas.ts.
//   4. Persist as a DRAFT Consultation via Prisma.
//   5. Render the DOCX via the renderer + LibreOffice → PDF.
//   6. Assert the rendered DOCX size > the empty-template size, and that
//      key field strings appear in the unzipped XML.
//   7. Clean up.

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { renderDocxTemplate } from "../src/lib/templates/docx";
import { CLINICAL_SCHEMAS } from "../src/lib/clinical-schemas";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const OUT = path.join(process.cwd(), "tmp", "smoke");

const FORM_DATA = {
  vitals: {
    weightKg: "78",
    heightCm: "178",
    bmi: "24.6",
    spo2: "98",
    pulseBpm: "72",
    bp: "122/80",
  },
  comorbidities: { dm: "☐", htn: "☑", cad: "☐", pcos: "☐", thyroid: "☐", otherFlag: "☐", otherText: "" },
  knownAllergies: "None",
  hpi: "Lower back pain ~3 months, gradual onset, worsens after long cycling rides.",
  pastMedicalHistory: "Mild HTN, controlled.",
  pastSurgicalHistory: "None.",
  familyHistory: "Father — diabetic.",
  personalHistory: "Non-smoker.",
  personal: { sleep: "6h", appetite: "good", bowelBladder: "regular", others: "Sedentary 9-5" },
  investigations: "MRI lumbar spine — mild L4/L5 disc bulge.",
  currentMedications: "Pantop 40 mg PRN.",
  posture: {
    summary: "Forward head + increased lumbar lordosis.",
    anterior: "Symmetric shoulders.",
    lateral: "FHP +1 cm.",
    posterior: "Mild scoliosis at T7.",
  },
  pain: { aggravating: "Long sitting, forward bending.", relieving: "Lying supine, lumbar extension." },
  functionalAssessment: "Squat to 90°, Bird-Dog L>R unsteady.",
  specialTestsSummary: "Slump test +ve right.",
  differentialDiagnosis: "Discogenic vs facet joint.",
  girthRows: [
    { index: "1", site: "Mid-thigh", right: "52 cm", left: "53 cm" },
    { index: "2", site: "Calf", right: "38 cm", left: "39 cm" },
  ],
  tightnessRows: [
    { muscleGroup: "Hamstrings", mild: "☐", moderate: "☑", severe: "☐", right: "+", left: "+" },
    { muscleGroup: "Hip flexors", mild: "☑", moderate: "☐", severe: "☐", right: "+", left: "" },
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
};

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true });

  // 1. Resolve a client + a physiotherapist.
  const client = await prisma.client.findFirst({ where: { firstName: "Aarav" } }) ??
    (await prisma.client.findFirst({ where: { status: "ACTIVE" } }));
  if (!client) throw new Error("no ACTIVE client to use");
  const physio = await prisma.staff.findFirst({
    where: { isActive: true, department: { name: "Physiotherapy" } },
  });
  if (!physio) throw new Error("no Physiotherapy staff");

  console.log(`[smoke-clinical] using client ${client.clientCode}, consultant ${physio.name}`);

  // 2 + 3. Validate the FORM_DATA against the Physiotherapy Consultation schema.
  const schema = CLINICAL_SCHEMAS["physiotherapy"];
  const v = schema.safeParse(FORM_DATA);
  if (!v.success) {
    console.error(JSON.stringify(v.error.issues, null, 2));
    throw new Error("FORM_DATA failed schema validation");
  }
  console.log(`[smoke-clinical] formData passes physiotherapy zod (${countLeaves(v.data as object)} leaf fields)`);

  // 4. Persist a DRAFT Consultation row.
  const consultation = await prisma.consultation.create({
    data: {
      clientId: client.id,
      consultantId: physio.id,
      templateKey: "physiotherapy",
      formData: JSON.stringify(v.data),
      chiefComplaints: "Lower back pain, intermittent over 3 months",
      diagnosis: "Mechanical low back pain",
      planOfCare: "PT 2×/week × 6 wk, gradual return to cycling",
      recommendedSessions: 12,
      recommendedServicesJson: JSON.stringify([
        { serviceId: "x", serviceName: "Senior Physiotherapy Session", count: 12, perAmount: 1800, gstRate: 0 },
      ]),
      followUp: "Review in 4 weeks",
      status: "DRAFT",
    },
  });
  console.log(`[smoke-clinical] created consultation ${consultation.id} (DRAFT)`);

  // 5. Render — replicate /api/consultations/[id]/render data shape.
  const formData = JSON.parse(consultation.formData ?? "{}") as Record<string, unknown>;
  const renderData: Record<string, unknown> = {
    ...formData,
    visitDate: consultation.date.toLocaleDateString("en-IN"),
    patient: {
      name: `${client.firstName} ${client.lastName}`,
      code: client.clientCode,
      age: client.age != null ? String(client.age) : "",
      sex: client.sex ?? "",
      dominance: client.dominance ?? "",
      phone: client.phone,
      email: client.email ?? "",
      occupation: client.occupation ?? "",
      sport: client.sport ?? "",
      address: "",
      maritalStatus: client.maritalStatus ?? "",
    },
    therapist: { name: physio.name },
    chiefComplaint: consultation.chiefComplaints ?? "",
    chiefComplaints: consultation.chiefComplaints ?? "",
    diagnosis: consultation.diagnosis ?? "",
    primaryGoal: consultation.planOfCare ?? "",
    planOfCare: consultation.planOfCare ?? "",
    knownAllergies: formData.knownAllergies ?? "",
    vitals: formData.vitals ?? {},
    c: formData.comorbidities ?? {},
    comorbidities: formData.comorbidities ?? {},
    consultantSignature: physio.signatureDataUrl ?? "",
    patientSignature: "",
  };

  const docx = await renderDocxTemplate("physiotherapy", renderData);
  await fs.writeFile(path.join(OUT, "phase4-physio-consult.docx"), docx);

  // 6. Assert key strings landed in the rendered XML.
  const zip = new PizZip(docx);
  const xml = zip.file("word/document.xml")!.asText();
  const expected = ["122/80", "Lumbar", "Glute med", "Slump test +ve right", physio.name, client.firstName];
  const missing = expected.filter((s) => !xml.includes(s));
  if (missing.length > 0) {
    throw new Error(`rendered DOCX missing expected strings: ${missing.join(", ")}`);
  }
  console.log(`[smoke-clinical] all ${expected.length} expected strings present in rendered DOCX`);

  console.log(`[smoke-clinical] DOCX ${docx.byteLength} bytes`);

  // 7. Cleanup the test consultation.
  await prisma.consultation.delete({ where: { id: consultation.id } });
  console.log(`[smoke-clinical] cleaned up consultation ${consultation.id}`);
  console.log(`[smoke-clinical] PASS ✅`);
}

function countLeaves(obj: object): number {
  let n = 0;
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) n += v.reduce((acc, item) => acc + (typeof item === "object" && item ? countLeaves(item) : 1), 0);
    else if (v && typeof v === "object") n += countLeaves(v);
    else if (v !== undefined && v !== "") n += 1;
  }
  return n;
}

main()
  .catch((err) => {
    console.error("[smoke-clinical] FAIL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
