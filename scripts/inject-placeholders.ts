// Injects {{placeholder}} markers into DOCX templates that ship from the
// client without them. Reads `templates/<name>.docx`, modifies the inner
// `word/document.xml` by:
//   (a) exact-string replacement on `<w:t>` text content for header fields
//   (b) injecting a docxtemplater table-row loop for repeating session tables
// then re-zips.

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

interface Replacement {
  match: string;
  replace: string;
  occurrence?: number;
}

/**
 * Inject a docxtemplater table-row loop into the first empty row of a table
 * located by the text content of its header row. Each column gets a placeholder
 * inserted as a fresh `<w:r><w:t>` run inside the existing empty `<w:p>`.
 *
 * The rendered output replicates the templated row once per item in
 * `loopName` (so caller passes data as `{ [loopName]: [{...}, {...}] }`).
 * Rows after the templated one stay empty (paper-fillable spillover).
 */
interface RowLoop {
  /** Visible header texts that uniquely identify the table. Match order matters. */
  headerColumns: readonly string[];
  /** docxtemplater loop variable, e.g. "sessions". */
  loopName: string;
  /** Per-column placeholder names. Same length as headerColumns. */
  cellPlaceholders: readonly string[];
}

interface InjectionTarget {
  file: string;
  replacements: Replacement[];
  rowLoops?: RowLoop[];
}

const COMMON_INTAKE_REPLACEMENTS: Replacement[] = [
  { match: "Date: ____/____/________", replace: "Date: {{visitDate}}", occurrence: 1 },
  { match: "Name: ___________________________________________", replace: "Name: {{patient.name}}" },
  { match: "Date of Birth: ____/____/________", replace: "Date of Birth: {{patient.dob}}" },
  { match: "__________", replace: "{{patient.age}}", occurrence: 1 },
  { match: "__________", replace: "{{patient.sex}}", occurrence: 1 },
  { match: "_______________________", replace: "{{patient.phone}}", occurrence: 1 },
  { match: "Address:    ________________________________________________________________________", replace: "Address:    {{patient.address}}" },
  {
    match:
      "Email ID:   _______________________________________      Time of Visit:  _________________",
    replace: "Email ID:   {{patient.email}}      Time of Visit:  {{visitTime}}",
  },
  {
    match:
      "Emergency Contact Name & Number:     ________________________   _____________________",
    replace:
      "Emergency Contact Name & Number:     {{emergency.name}}   {{emergency.phone}}",
  },
  { match: "Pain/ Injury", replace: "{{r.painInjury}} Pain/ Injury" },
  { match: "Physiotherapy", replace: "{{r.physiotherapy}} Physiotherapy" },
  { match: "Strength & Conditioning", replace: "{{r.strengthConditioning}} Strength & Conditioning" },
  { match: "Sports / Deep Tissue / Massage Therapy", replace: "{{r.massage}} Sports / Deep Tissue / Massage Therapy" },
  { match: "Wellness Yoga", replace: "{{r.yoga}} Wellness Yoga" },
  { match: "Nutrition Guidance", replace: "{{r.nutrition}} Nutrition Guidance" },
  { match: "Counselling / Stress Support", replace: "{{r.counselling}} Counselling / Stress Support" },
  { match: "Preventive / Wellness Consultation", replace: "{{r.prevention}} Preventive / Wellness Consultation" },
  { match: "Others: ", replace: "Others: {{r.othersText}}" },
  { match: "     Assigned to:  _______", replace: "     Assigned to:  {{assignedTo}}" },
  { match: "_________________________", replace: "{{patientSignature}}", occurrence: 1 },
  { match: "     Assigned by:  ______________________________", replace: "     Assigned by:  {{assignedBy}}" },
  { match: "_____________________________", replace: "{{frontOffice.signature}}", occurrence: 1 },
  { match: "Date: ____/____/________", replace: "Date: {{visitDate}}", occurrence: 1 },
  { match: "________________________________________", replace: "{{patient.name}}", occurrence: 1 },
  { match: "___________________________________", replace: "{{patientSignature}}", occurrence: 1 },
  { match: "____________________________________", replace: "{{frontOffice.name}}", occurrence: 1 },
];

// ---------- Follow-up templates ----------
//
// All follow-up sheets share a similar header (name, id, age, sex, dominance,
// contact, address, occupation in some) plus an optional vitals block plus a
// repeating session table. The header replacements use the same underscore
// patterns as the intake form. The repeating table uses the rowLoops mechanic.

const HEADER_COMMON_REPLACEMENTS: Replacement[] = [
  { match: "Date: ____/____/________", replace: "Date: {{visitDate}}", occurrence: 1 },
  { match: "__________________________________________________", replace: "{{patient.name}}", occurrence: 1 },
  { match: "_______________", replace: "{{patient.code}}", occurrence: 1 },
  // The big "Age: ___ Sex: ___ Dominance: ___ Contact no.:" line varies slightly
  // per template, so we replace the whole line in each per-template list below.
];

const VITALS_REPLACEMENTS: Replacement[] = [
  { match: "_______ kg", replace: "{{vitals.weightKg}} kg", occurrence: 1 },
  { match: "_______ kg/cm", replace: "{{vitals.bmi}} kg/cm", occurrence: 1 },
  { match: "2:     __________", replace: "2:     {{vitals.spo2}}", occurrence: 1 },
  { match: " % on ______", replace: " % on {{vitals.spo2Device}}", occurrence: 1 },
  { match: "_______ cm", replace: "{{vitals.heightCm}} cm", occurrence: 1 },
  { match: "_______ bpm", replace: "{{vitals.pulseBpm}} bpm", occurrence: 1 },
  { match: "BP:      ___", replace: "BP:      {{vitals.bp}}", occurrence: 1 },
  { match: "BP:  ___", replace: "BP:  {{vitals.bp}}", occurrence: 1 },
];

const COMORBIDITIES_REPLACEMENTS: Replacement[] = [
  { match: " DM   ", replace: "{{c.dm}} DM   ", occurrence: 1 },
  { match: " HTN   ", replace: "{{c.htn}} HTN   ", occurrence: 1 },
  { match: " CAD   ", replace: "{{c.cad}} CAD   ", occurrence: 1 },
  { match: " PCOS   ", replace: "{{c.pcos}} PCOS   ", occurrence: 1 },
  { match: " Thyroid issues (", replace: "{{c.thyroid}} Thyroid issues (", occurrence: 1 },
  { match: " Other: _____________________", replace: "{{c.otherFlag}} Other: {{c.otherText}}", occurrence: 1 },
];

const PHYSIO_FOLLOWUP: InjectionTarget = {
  file: "PHYSIOTHERAPY_FOLLOW_UP.docx",
  replacements: [
    ...HEADER_COMMON_REPLACEMENTS,
    {
      match:
        "Age: _________     Sex: __________     Dominance: __________     Contact no.: ",
      replace:
        "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.: ",
    },
    { match: "__________________________", replace: "{{patient.phone}}", occurrence: 1 },
    {
      match:
        "Occupation: ___________________      Sport: _______________________________________________________",
      replace: "Occupation: {{patient.occupation}}      Sport: {{patient.sport}}",
    },
    { match: "Address: _____________________________________", replace: "Address: {{patient.address}}" },
    { match: " ________________ ", replace: " {{therapist.name}} ", occurrence: 1 },
    ...VITALS_REPLACEMENTS,
    ...COMORBIDITIES_REPLACEMENTS,
    { match: "C/O: __________________________________________________________________________________________", replace: "C/O: {{chiefComplaint}}" },
    // Page 2 header (repeated)
    { match: "______________________________", replace: "{{patient.name}}", occurrence: 1 },
    { match: "C/O: ________________________________________", replace: "C/O: {{chiefComplaint}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      headerColumns: ["No.", "Date", "PT Rx", "Modality (if any)", "Remark", "Sign"],
      loopName: "sessions",
      cellPlaceholders: ["sessionNumber", "date", "ptRx", "modality", "remark", "sign"],
    },
    {
      // Page 2 has the same header (without "Remark" column slot — see inspection).
      headerColumns: ["No.", "Date", "PT Rx", "Modality (if any)", "Sign"],
      loopName: "sessionsPage2",
      cellPlaceholders: ["sessionNumber", "date", "ptRx", "modality", "sign"],
    },
  ],
};

const PHYSICIAN_FOLLOWUP: InjectionTarget = {
  file: "PHYSICIAN_FOLLOW_UP.docx",
  replacements: [
    ...HEADER_COMMON_REPLACEMENTS,
    {
      match:
        "Age: _________     Sex: __________     Dominance: __________     Contact no.: ____________________________",
      replace:
        "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.: {{patient.phone}}",
    },
    { match: "Address: ______________________________________________________________________________________", replace: "Address: {{patient.address}}" },
    ...VITALS_REPLACEMENTS,
    ...COMORBIDITIES_REPLACEMENTS,
    { match: "Known allergies: ____________________________", replace: "Known allergies: {{knownAllergies}}" },
    { match: "Primary Goal: ____________________________________", replace: "Primary Goal: {{primaryGoal}}" },
    { match: "______________________________     Goal: ____________________________________________", replace: "{{patient.name}}     Goal: {{primaryGoal}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      // 5 actual cells; "Follow up Session" is one cell with 2 text runs.
      headerColumns: ["No.", "Date", "Follow up", " Session", "Remark", "Sign"],
      loopName: "sessions",
      cellPlaceholders: ["sessionNumber", "date", "notes", "remark", "sign"],
    },
    {
      headerColumns: ["No.", "Date", "Follow up", " Session", "Remark", "Sign"],
      loopName: "sessionsPage2",
      cellPlaceholders: ["sessionNumber", "date", "notes", "remark", "sign"],
    },
  ],
};

const COUNSELLING_FOLLOWUP: InjectionTarget = {
  file: "COUNSELLING_FOLLOW_UP.docx",
  replacements: [
    ...HEADER_COMMON_REPLACEMENTS,
    {
      match:
        "Age: _________     Sex: __________     Dominance: __________     Contact no.: ",
      replace:
        "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.: ",
    },
    { match: "__________________________", replace: "{{patient.phone}}", occurrence: 1 },
    { match: "Occupation: ___________________ ", replace: "Occupation: {{patient.occupation}} ", occurrence: 1 },
    { match: ": ______________________________________________________", replace: ": {{patient.email}}", occurrence: 1 },
    { match: "Marital Status: __________________________  ", replace: "Marital Status: {{patient.maritalStatus}}  " },
    { match: "____________", replace: "{{therapist.name}}", occurrence: 1 },
    { match: "Name: _____________________    Contact no.: ____________________     Relationship: ____________________", replace: "Name: {{emergency.name}}    Contact no.: {{emergency.phone}}     Relationship: {{emergency.relationship}}" },
    { match: "Primary Goal: __________________________________________________________________________________", replace: "Primary Goal: {{primaryGoal}}" },
    { match: "______________________________     Goal: ____________________________________________", replace: "{{patient.name}}     Goal: {{primaryGoal}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      headerColumns: ["No.", "Date", "Counselling", " Session", "Remark", "Sign"],
      loopName: "sessions",
      cellPlaceholders: ["sessionNumber", "date", "notes", "remark", "sign"],
    },
    {
      headerColumns: ["No.", "Date", "Counselling", " Session", "Remark", "Sign"],
      loopName: "sessionsPage2",
      cellPlaceholders: ["sessionNumber", "date", "notes", "remark", "sign"],
    },
  ],
};

const NUTRITION_FOLLOWUP: InjectionTarget = {
  file: "NUTRITION_COUNSELLING_FOLLOW_UP.docx",
  replacements: [
    ...HEADER_COMMON_REPLACEMENTS,
    { match: "Patient ID:        _______________", replace: "Patient ID:        {{patient.code}}" },
    { match: "Age: _________     Sex: __________     Dominance: __________     Contact no.:   __________________________", replace: "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.:   {{patient.phone}}" },
    { match: "Occupation: ___________________      Sport: _______________________________________________________", replace: "Occupation: {{patient.occupation}}      Sport: {{patient.sport}}" },
    { match: "Address: _____________________________________", replace: "Address: {{patient.address}}" },
    { match: ": ", replace: ": {{therapist.name}}", occurrence: 2 }, // "Attending Nutritionist: ____"
    ...VITALS_REPLACEMENTS,
    { match: ")    Other: _____________________", replace: "{{c.thyroidEnd}})    {{c.otherFlag}} Other: {{c.otherText}}", occurrence: 1 },
    { match: "C/O: __________________________________________________________________________________________", replace: "C/O: {{chiefComplaint}}" },
    { match: "Primary Goal: __________________________________________________________________________________", replace: "Primary Goal: {{primaryGoal}}" },
    { match: "______________________________     Goal: ____________________________________________", replace: "{{patient.name}}     Goal: {{primaryGoal}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      headerColumns: ["No.", "Date", "Nutrition ", "Counselling", " Session", "Remark", "Sign"],
      loopName: "sessions",
      cellPlaceholders: ["sessionNumber", "date", "notes", "remark", "sign"],
    },
    {
      headerColumns: ["No.", "Date", "Nutrition ", "Counselling", " Session", "Remark", "Sign"],
      loopName: "sessionsPage2",
      cellPlaceholders: ["sessionNumber", "date", "notes", "remark", "sign"],
    },
  ],
};

const YOGA_FOLLOWUP: InjectionTarget = {
  file: "WELLNESS_YOGA_FOLLOW_UP.docx",
  replacements: [
    ...HEADER_COMMON_REPLACEMENTS,
    { match: "Patient ID:        _______________", replace: "Patient ID:        {{patient.code}}" },
    { match: "Age: _________     Sex: __________     Dominance: __________     Contact no.:   __________________________", replace: "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.:   {{patient.phone}}" },
    { match: "Occupation: ___________________  Email ID: ______________________________________________________", replace: "Occupation: {{patient.occupation}}  Email ID: {{patient.email}}" },
    { match: "Address: ______________________________________________________________________________________", replace: "Address: {{patient.address}}" },
    { match: "____________", replace: "{{therapist.name}}", occurrence: 1 },
    { match: "Name: _____________________    Contact no.: ____________________     Relationship: ____________________", replace: "Name: {{emergency.name}}    Contact no.: {{emergency.phone}}     Relationship: {{emergency.relationship}}" },
    { match: ": _________________________________________________________________________________", replace: ": {{primaryGoal}}", occurrence: 1 },
    { match: "______________________________", replace: "{{patient.name}}", occurrence: 1 },
    { match: ": ________________________________________", replace: ": {{primaryGoal}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      headerColumns: ["No.", "Date", "Yoga Session", "Remark", "Sign"],
      loopName: "sessions",
      cellPlaceholders: ["sessionNumber", "date", "yogaSession", "remark", "sign"],
    },
    {
      headerColumns: ["No.", "Date", "Yoga Session", "Remark", "Sign"],
      loopName: "sessionsPage2",
      cellPlaceholders: ["sessionNumber", "date", "yogaSession", "remark", "sign"],
    },
  ],
};

const SC_FOLLOWUP: InjectionTarget = {
  file: "SC_FOLLOW_UP.docx",
  replacements: [
    ...HEADER_COMMON_REPLACEMENTS,
    { match: "Patient ID:        _______________", replace: "Patient ID:        {{patient.code}}" },
    { match: "Age: _________     Sex: __________     Dominance: __________     Contact no.:   __________________________", replace: "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.:   {{patient.phone}}" },
    { match: "Occupation: ___________________      Sport: _______________________________________________________", replace: "Occupation: {{patient.occupation}}      Sport: {{patient.sport}}" },
    { match: "Address: __________________________________", replace: "Address: {{patient.address}}" },
    { match: "           Attending Coach / Physiotherapist: ___________________", replace: "           Attending Coach / Physiotherapist: {{therapist.name}}" },
    { match: "Name: _____________________    Contact no.: ____________________     Relationship: ____________________", replace: "Name: {{emergency.name}}    Contact no.: {{emergency.phone}}     Relationship: {{emergency.relationship}}" },
    ...VITALS_REPLACEMENTS,
    ...COMORBIDITIES_REPLACEMENTS,
    { match: ": __________________________________________________________________________________", replace: ": {{primaryGoal}}", occurrence: 1 },
    { match: "Current/Past Injuries: ___________________________________________________________________________", replace: "Current/Past Injuries: {{injuries}}" },
    { match: "______________________________     Goal: ____________________________________________", replace: "{{patient.name}}     Goal: {{primaryGoal}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      headerColumns: ["No.", "Date", "Exercises", "Load", "Volume", "RPE", "Remark", "Sign"],
      loopName: "sessions",
      cellPlaceholders: ["sessionNumber", "date", "exercises", "load", "volume", "rpe", "remark", "sign"],
    },
    {
      headerColumns: ["No.", "Date", "Exercises", "Load", "Volume", "RPE", "Remark", "Sign"],
      loopName: "sessionsPage2",
      cellPlaceholders: ["sessionNumber", "date", "exercises", "load", "volume", "rpe", "remark", "sign"],
    },
  ],
};

const COMMON_INTAKE: InjectionTarget = {
  file: "COMMON_PATIENT_INTAKE_FORM.docx",
  replacements: COMMON_INTAKE_REPLACEMENTS,
};

// Second pass on the consent form: upgrade the existing text placeholders
// to image-module placeholders so docxtemplater embeds PNG signatures.
// Idempotent — re-runs no-op once the % prefix is in place.
const COMMON_INTAKE_SIGNATURE_UPGRADE: InjectionTarget = {
  file: "COMMON_PATIENT_INTAKE_FORM.docx",
  replacements: [
    { match: "{{patientSignature}}", replace: "{{%patientSignature}}" },
    { match: "{{frontOffice.signature}}", replace: "{{%frontOffice.signature}}" },
  ],
};

// ───────────────────────────────────────────────────────────
// First-visit consultations (Phase 1 of the revamp).
// These ship as the client's originals; we add header + vitals +
// comorbidities + free-text replacements. The Physiotherapy template also
// gets row-loops on five examination tables (Girth, Tightness, ROM, MMT,
// Neurological).
// ───────────────────────────────────────────────────────────

const PHYSICIAN_CONSULTATION: InjectionTarget = {
  file: "PHYSICIAN_CONSULTATION.docx",
  replacements: [
    { match: "Date: ____/____/________", replace: "Date: {{visitDate}}", occurrence: 1 },
    {
      match: "__________________________________________________",
      replace: "{{patient.name}}",
      occurrence: 1,
    },
    { match: "________________", replace: "{{patient.code}}", occurrence: 1 },
    {
      match:
        "Age: _________     Sex: __________     Dominance: __________     Contact no.: ____________________________",
      replace:
        "Age: {{patient.age}}     Sex: {{patient.sex}}     Dominance: {{patient.dominance}}     Contact no.: {{patient.phone}}",
    },
    {
      match:
        "Address: ______________________________________________________________________________________",
      replace: "Address: {{patient.address}}",
    },
    ...VITALS_REPLACEMENTS,
    ...COMORBIDITIES_REPLACEMENTS,
    {
      match: "Known allergies: _____________________________________________",
      replace: "Known allergies: {{knownAllergies}}",
    },
    // Long-line free-text fields. Each field appears as a label on its own
    // line; the form expects the user to write below it. We inject the
    // placeholder right after the label so docxtemplater fills it inline.
    { match: "Chief Complaints:", replace: "Chief Complaints: {{chiefComplaints}}", occurrence: 1 },
    { match: "Past Medical History:", replace: "Past Medical History: {{pastMedicalHistory}}", occurrence: 1 },
    { match: "Past Surgical History:", replace: "Past Surgical History: {{pastSurgicalHistory}}", occurrence: 1 },
    { match: "Family History:", replace: "Family History: {{familyHistory}}", occurrence: 1 },
    { match: "Personal History:", replace: "Personal History: {{personalHistory}}", occurrence: 1 },
    { match: "Sleep:", replace: "Sleep: {{personal.sleep}}", occurrence: 1 },
    { match: "Appetite:", replace: "Appetite: {{personal.appetite}}", occurrence: 1 },
    { match: "Bowel/Bladder:", replace: "Bowel/Bladder: {{personal.bowelBladder}}", occurrence: 1 },
    { match: "Others: ", replace: "Others: {{personal.others}}", occurrence: 1 },
    { match: "Diagnosis:", replace: "Diagnosis: {{diagnosis}}", occurrence: 1 },
    { match: "Current Medications:", replace: "Current Medications: {{currentMedications}}", occurrence: 1 },
    { match: "Plan of Care &amp; Advice:", replace: "Plan of Care &amp; Advice: {{planOfCare}}", occurrence: 1 },
    { match: "Follow up:", replace: "Follow up: {{followUp}}", occurrence: 1 },
    // Lab investigations: each test is a checkbox-style entry. Map to lab.* booleans.
    { match: " CBC", replace: "{{lab.cbc}} CBC", occurrence: 1 },
    { match: " Renal Function Test", replace: "{{lab.rft}} Renal Function Test", occurrence: 1 },
    { match: " Liver Function Test", replace: "{{lab.lft}} Liver Function Test", occurrence: 1 },
    { match: " Thyroid Function Test", replace: "{{lab.tft}} Thyroid Function Test", occurrence: 1 },
    { match: " Lipid Profile", replace: "{{lab.lipid}} Lipid Profile", occurrence: 1 },
    { match: " CMP", replace: "{{lab.cmp}} CMP", occurrence: 1 },
    { match: " HbA1c", replace: "{{lab.hba1c}} HbA1c", occurrence: 1 },
    { match: " Urinalysis", replace: "{{lab.urinalysis}} Urinalysis", occurrence: 1 },
    // Diagnostic imaging
    { match: " X-Ray", replace: "{{imaging.xray}} X-Ray", occurrence: 1 },
    { match: " MRI", replace: "{{imaging.mri}} MRI", occurrence: 1 },
    { match: " CT", replace: "{{imaging.ct}} CT", occurrence: 1 },
    { match: " USG", replace: "{{imaging.usg}} USG", occurrence: 1 },
    { match: " ECG", replace: "{{imaging.ecg}} ECG", occurrence: 1 },
    { match: " DEXA Scan", replace: "{{imaging.dexa}} DEXA Scan", occurrence: 1 },
    // Internal reference checkboxes (department referrals)
    { match: " Physiotherapy", replace: "{{ref.physiotherapy}} Physiotherapy", occurrence: 1 },
    { match: " Strength &amp; Conditioning", replace: "{{ref.sc}} Strength &amp; Conditioning", occurrence: 1 },
    { match: " Sports / Deep Tissue Massage", replace: "{{ref.massage}} Sports / Deep Tissue Massage", occurrence: 1 },
    { match: " Nutrition Guidance", replace: "{{ref.nutrition}} Nutrition Guidance", occurrence: 1 },
    { match: " Counselling &amp; Stress support", replace: "{{ref.counselling}} Counselling &amp; Stress support", occurrence: 1 },
    { match: " Wellness Yoga", replace: "{{ref.yoga}} Wellness Yoga", occurrence: 1 },
    { match: " Yes  ", replace: "{{wellnessProgram.yes}} Yes  ", occurrence: 1 },
    { match: " No", replace: "{{wellnessProgram.no}} No", occurrence: 1 },
  ],
};

const PHYSIOTHERAPY_CONSULTATION: InjectionTarget = {
  file: "PHYSIOTHERAPY_CONSULTATION.docx",
  replacements: [
    { match: "Date: ____/____/________", replace: "Date: {{visitDate}}", occurrence: 1 },
    {
      match: "__________________________________________________",
      replace: "{{patient.name}}",
      occurrence: 1,
    },
    { match: "_______________", replace: "{{patient.code}}", occurrence: 1 },
    { match: "__________________________", replace: "{{patient.phone}}", occurrence: 1 },
    {
      match:
        "Occupation: ___________________      Sport: _______________________________________________________",
      replace: "Occupation: {{patient.occupation}}      Sport: {{patient.sport}}",
    },
    {
      match: "Address: _____________________________________",
      replace: "Address: {{patient.address}}",
    },
    { match: " ________________ ", replace: " {{therapist.name}} ", occurrence: 1 },
    ...VITALS_REPLACEMENTS,
    ...COMORBIDITIES_REPLACEMENTS,
    {
      match: "Known allergies: _____________________________________________",
      replace: "Known allergies: {{knownAllergies}}",
    },
    { match: "Chief Complaints:", replace: "Chief Complaints: {{chiefComplaints}}", occurrence: 1 },
    { match: "History of Presenting Illness:", replace: "History of Presenting Illness: {{hpi}}", occurrence: 1 },
    { match: "Past Medical History:", replace: "Past Medical History: {{pastMedicalHistory}}", occurrence: 1 },
    { match: "Past Surgical History:", replace: "Past Surgical History: {{pastSurgicalHistory}}", occurrence: 1 },
    { match: "Family History:", replace: "Family History: {{familyHistory}}", occurrence: 1 },
    { match: "Personal History:", replace: "Personal History: {{personalHistory}}", occurrence: 1 },
    { match: "Sleep:", replace: "Sleep: {{personal.sleep}}", occurrence: 1 },
    { match: "Appetite:", replace: "Appetite: {{personal.appetite}}", occurrence: 1 },
    { match: "Bowel/Bladder:", replace: "Bowel/Bladder: {{personal.bowelBladder}}", occurrence: 1 },
    { match: "Investigations (if any):", replace: "Investigations (if any): {{investigations}}", occurrence: 1 },
    { match: "Current Medications:", replace: "Current Medications: {{currentMedications}}", occurrence: 1 },
    { match: "Posture Assessment:", replace: "Posture Assessment: {{posture.summary}}", occurrence: 1 },
    { match: "Anterior view:", replace: "Anterior view: {{posture.anterior}}", occurrence: 1 },
    { match: "Lateral view:", replace: "Lateral view: {{posture.lateral}}", occurrence: 1 },
    { match: "Posterior view:", replace: "Posterior view: {{posture.posterior}}", occurrence: 1 },
    { match: "Aggravating Factors:", replace: "Aggravating Factors: {{pain.aggravating}}", occurrence: 1 },
    { match: "Relieving Factors:", replace: "Relieving Factors: {{pain.relieving}}", occurrence: 1 },
    { match: "Functional Assessment:", replace: "Functional Assessment: {{functionalAssessment}}", occurrence: 1 },
    { match: "Special Tests (if any):", replace: "Special Tests (if any): {{specialTestsSummary}}", occurrence: 1 },
    { match: "Differential Diagnosis:", replace: "Differential Diagnosis: {{differentialDiagnosis}}", occurrence: 1 },
  ],
  rowLoops: [
    {
      headerColumns: ["No.", "Site", "Right", "Left"],
      loopName: "girthRows",
      cellPlaceholders: ["index", "site", "right", "left"],
    },
    {
      headerColumns: ["Muscle group(s)", "Mild tightness", "Moderate tightness", "Severe tightness", "Right", "Left"],
      loopName: "tightnessRows",
      cellPlaceholders: ["muscleGroup", "mild", "moderate", "severe", "right", "left"],
    },
    {
      headerColumns: ["No.", "Joint", "Movement", "Right", "Left", "End feel"],
      loopName: "romRows",
      cellPlaceholders: ["index", "joint", "movement", "right", "left", "endFeel"],
    },
    {
      headerColumns: ["No.", "Joint", "Muscle group", "Right", "Left"],
      loopName: "mmtRows",
      cellPlaceholders: ["index", "joint", "muscleGroup", "right", "left"],
    },
    {
      headerColumns: ["No.", "Sensory component", "Right", "Left", "Equality"],
      loopName: "neuroRows",
      cellPlaceholders: ["index", "component", "right", "left", "equality"],
    },
  ],
};

const TARGETS: InjectionTarget[] = (() => {
  const all: InjectionTarget[] = [
    // COMMON_INTAKE first-pass was injected in original Phase 2; re-running no-ops.
    PHYSIO_FOLLOWUP,
    PHYSICIAN_FOLLOWUP,
    COUNSELLING_FOLLOWUP,
    NUTRITION_FOLLOWUP,
    YOGA_FOLLOWUP,
    SC_FOLLOWUP,
    PHYSICIAN_CONSULTATION,
    PHYSIOTHERAPY_CONSULTATION,
    // Revamp Phase 2: upgrade signature placeholders to image-embed style.
    COMMON_INTAKE_SIGNATURE_UPGRADE,
  ];
  // Allow filtering via env var when re-running on a subset.
  const filter = process.env.INJECT_ONLY;
  if (!filter) return all;
  const wanted = filter.split(",").map((s) => s.trim());
  return all.filter((t) => wanted.includes(t.file));
})();

const TEMPLATES_ROOT = path.join(process.cwd(), "templates");

async function inject(target: InjectionTarget): Promise<void> {
  const fullPath = path.join(TEMPLATES_ROOT, target.file);
  const buf = await fs.readFile(fullPath);
  const zip = new PizZip(buf);
  const docXmlEntry = zip.file("word/document.xml");
  if (!docXmlEntry) throw new Error(`word/document.xml missing in ${target.file}`);
  let xml = docXmlEntry.asText();

  // 1. Header field replacements via <w:t> string substitution.
  let applied = 0;
  for (const r of target.replacements) {
    const escaped = escapeXml(r.match);
    if (!xml.includes(escaped)) continue;
    const replaceWith = escapeXml(r.replace);
    if (r.occurrence !== undefined) {
      xml = replaceNth(xml, escaped, replaceWith, r.occurrence);
    } else {
      xml = xml.split(escaped).join(replaceWith);
    }
    applied++;
  }

  // 2. Table-row loops.
  let loopsApplied = 0;
  for (const loop of target.rowLoops ?? []) {
    const result = injectRowLoop(xml, loop);
    if (result.injected) {
      xml = result.xml;
      loopsApplied++;
    } else {
      console.warn(
        `[inject] WARN: rowLoop ${loop.loopName} not found in ${target.file}`,
      );
    }
  }

  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(fullPath, out);
  console.log(
    `[inject] ${target.file}: ${applied} field rules, ${loopsApplied} loops`,
  );
}

function replaceNth(haystack: string, needle: string, replacement: string, n: number): string {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = haystack.indexOf(needle, idx + 1);
    if (idx < 0) return haystack;
  }
  return haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
}

interface RowLoopResult {
  xml: string;
  injected: boolean;
}

/**
 * Find the first table whose header row matches the configured columns and
 * inject docxtemplater loop tags + cell placeholders into the FIRST empty
 * row that follows.
 */
function injectRowLoop(xml: string, loop: RowLoop): RowLoopResult {
  const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
  const rows: { start: number; end: number; inner: string; texts: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = trRegex.exec(xml)) !== null) {
    const inner = m[1] ?? "";
    const texts = [...inner.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((mm) => mm[1] ?? "");
    rows.push({ start: m.index, end: m.index + m[0].length, inner, texts });
  }

  // Locate the header row.
  const headerIdx = rows.findIndex((row) => columnsMatch(row.texts, loop.headerColumns));
  if (headerIdx < 0) return { xml, injected: false };

  // First empty row AFTER the header.
  const emptyIdx = rows.findIndex(
    (row, i) => i > headerIdx && row.texts.every((t) => !t.trim()),
  );
  if (emptyIdx < 0) return { xml, injected: false };

  const emptyRow = rows[emptyIdx]!;
  const newInner = injectCellsInRow(emptyRow.inner, loop);
  if (newInner === emptyRow.inner) return { xml, injected: false };

  const newRowXml = `<w:tr ${extractRowAttrs(xml, emptyRow.start)}>${newInner}</w:tr>`;

  return {
    xml: xml.slice(0, emptyRow.start) + newRowXml + xml.slice(emptyRow.end),
    injected: true,
  };
}

function columnsMatch(texts: string[], expected: readonly string[]): boolean {
  // Concatenate texts and check the expected sequence appears in order. Some
  // header cells split labels across multiple <w:t> runs (e.g. "Nutrition " +
  // "Counselling" + " Session"), so we match on substring containment in
  // expected order rather than strict equality.
  const flat = texts.join("|");
  let cursor = 0;
  for (const e of expected) {
    const idx = flat.indexOf(e, cursor);
    if (idx < 0) return false;
    cursor = idx + e.length;
  }
  return true;
}

function extractRowAttrs(xml: string, start: number): string {
  const tagEnd = xml.indexOf(">", start);
  return xml.slice(start + "<w:tr".length, tagEnd).trim();
}

/**
 * For a row's inner XML (sequence of <w:tc> blocks), inject loop tags + a
 * placeholder text run into each cell's first paragraph.
 */
function injectCellsInRow(rowInner: string, loop: RowLoop): string {
  const tcRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
  const cells = [...rowInner.matchAll(tcRegex)];
  if (cells.length < loop.cellPlaceholders.length) return rowInner;

  let modified = rowInner;
  // Iterate from last to first so earlier offsets stay valid.
  for (let i = loop.cellPlaceholders.length - 1; i >= 0; i--) {
    const cell = cells[i]!;
    const cellStart = cell.index!;
    const cellEnd = cellStart + cell[0].length;
    const placeholder = loop.cellPlaceholders[i]!;
    const isFirst = i === 0;
    const isLast = i === loop.cellPlaceholders.length - 1;
    const text = `${isFirst ? `{{#${loop.loopName}}}` : ""}{{${placeholder}}}${
      isLast ? `{{/${loop.loopName}}}` : ""
    }`;
    const newCell = injectTextIntoCell(cell[0], text);
    modified = modified.slice(0, cellStart) + newCell + modified.slice(cellEnd);
  }
  return modified;
}

/**
 * Replace the cell's first paragraph with one that contains a single text
 * run. Handles both self-closing `<w:p ... />` (most common in empty rows)
 * and an existing `<w:p>...</w:p>` wrapper.
 */
function injectTextIntoCell(cellXml: string, text: string): string {
  const escapedText = escapeXml(text);
  // Find the first <w:p .../> or <w:p ...>...</w:p>
  const selfClose = cellXml.match(/<w:p\b[^/>]*\/>/);
  if (selfClose) {
    const fullTag = selfClose[0];
    const open = fullTag.replace(/\/>$/, ">");
    const replacement = `${open}<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r></w:p>`;
    return cellXml.replace(fullTag, replacement);
  }
  const block = cellXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
  if (block) {
    const open = block[0].match(/<w:p\b[^>]*>/)?.[0] ?? "<w:p>";
    const replacement = `${open}<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r></w:p>`;
    return cellXml.replace(block[0], replacement);
  }
  // Last-resort: append a paragraph at the end of the cell content.
  const closeTcAt = cellXml.lastIndexOf("</w:tc>");
  if (closeTcAt < 0) return cellXml;
  const inserted = `<w:p><w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r></w:p>`;
  return cellXml.slice(0, closeTcAt) + inserted + cellXml.slice(closeTcAt);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  for (const target of TARGETS) {
    await inject(target);
  }
  console.log("[inject] done");
}

void COMMON_INTAKE; // referenced for documentation; not re-injected.

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
