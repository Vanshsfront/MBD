// Phase 1 — Build the three intake-form DOCX templates that originally
// shipped only as PDFs (Wellness Yoga Intake, Counselling Intake, Functional
// Assessment Battery). PRD §6.1 last paragraph requires these as DOCX so
// docxtemplater can fill them like every other clinical form.
//
// The layouts are functional, not pixel-perfect to the PDF — the goal is
// "every field a placeholder, fillable, prints to A4 cleanly". Once Marazban
// shares the original DOCX (if he ever does) we can swap in the literal file
// and re-inject placeholders instead.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

const TEMPLATES_ROOT = path.join(process.cwd(), "templates");

const HEADER_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
} as const;

function field(label: string, placeholder: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: `${label} `, bold: true }),
      new TextRun({ text: `{{${placeholder}}}` }),
    ],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true })],
  });
}

function blank(label: string, placeholder: string): Paragraph {
  return new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: `{{${placeholder}}}` }),
    ],
  });
}

function checkboxLine(label: string, placeholder: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `{{${placeholder}}} `, bold: true }),
      new TextRun({ text: label }),
    ],
  });
}

function row(...cells: string[]): TableRow {
  return new TableRow({
    children: cells.map(
      (text) =>
        new TableCell({
          width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text })] })],
          borders: HEADER_BORDER,
        }),
    ),
  });
}

function loopRow(loopName: string, placeholders: string[]): TableRow {
  return new TableRow({
    children: placeholders.map((ph, i) => {
      const isFirst = i === 0;
      const isLast = i === placeholders.length - 1;
      const text =
        (isFirst ? `{{#${loopName}}}` : "") +
        `{{${ph}}}` +
        (isLast ? `{{/${loopName}}}` : "");
      return new TableCell({
        width: { size: 100 / placeholders.length, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text })] })],
        borders: HEADER_BORDER,
      });
    }),
  });
}

// ─── Wellness Yoga Intake ────────────────────────────────────
function yogaIntake(): Document {
  return new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "WELLNESS YOGA INTAKE FORM", bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Movement By Design — Colaba", italics: true })],
          }),
          blank("Date", "visitDate"),
          heading("Patient details"),
          field("Name:", "patient.name"),
          field("Patient ID:", "patient.code"),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Age: ", bold: true }),
              new TextRun({ text: "{{patient.age}}     " }),
              new TextRun({ text: "Sex: ", bold: true }),
              new TextRun({ text: "{{patient.sex}}     " }),
              new TextRun({ text: "Marital Status: ", bold: true }),
              new TextRun({ text: "{{patient.maritalStatus}}" }),
            ],
          }),
          field("Contact no.:", "patient.phone"),
          field("Email:", "patient.email"),
          field("Occupation:", "patient.occupation"),
          field("Address:", "patient.address"),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Emergency contact name: ", bold: true }),
              new TextRun({ text: "{{emergency.name}}     " }),
              new TextRun({ text: "Phone: ", bold: true }),
              new TextRun({ text: "{{emergency.phone}}     " }),
              new TextRun({ text: "Relationship: ", bold: true }),
              new TextRun({ text: "{{emergency.relationship}}" }),
            ],
          }),
          heading("Health & lifestyle"),
          blank("Primary goal / why yoga", "primaryGoal"),
          blank("Prior yoga experience", "yogaExperience"),
          blank("Current physical activity / exercise routine", "activityRoutine"),
          blank("Chronic conditions / medications", "chronicConditions"),
          blank("Recent surgeries or injuries", "recentInjuries"),
          blank("Stress level (1–10) / sleep quality", "stressSleep"),
          blank("Diet pattern", "dietPattern"),
          heading("Practice preferences"),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Format: ", bold: true }),
              new TextRun({
                text:
                  "{{p.individual}} Individual    {{p.duo}} Duo    {{p.group}} Group    {{p.online}} Online",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Time of day preference: ", bold: true }),
              new TextRun({ text: "{{p.timePreference}}" }),
            ],
          }),
          blank("Specific requests / contraindications", "specialRequests"),
          heading("Consent"),
          checkboxLine(
            "I confirm the above information is accurate to the best of my knowledge.",
            "consent.truth",
          ),
          checkboxLine(
            "I understand and accept the cancellation and refund policy.",
            "consent.cancellation",
          ),
          checkboxLine(
            "I release Movement By Design from liability for risks associated with yoga practice.",
            "consent.liability",
          ),
          new Paragraph({ spacing: { before: 200 } }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Patient signature: ", bold: true }),
              new TextRun({ text: "{{%patientSignature}}" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Yoga therapist: ", bold: true }),
              new TextRun({ text: "{{therapist.name}}    " }),
              new TextRun({ text: "Signature: ", bold: true }),
              new TextRun({ text: "{{%consultantSignature}}" }),
            ],
          }),
        ],
      },
    ],
  });
}

// ─── Counselling Intake ─────────────────────────────────────
function counsellingIntake(): Document {
  return new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "COUNSELLING INTAKE FORM", bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Movement By Design — Colaba", italics: true })],
          }),
          blank("Date", "visitDate"),
          heading("Patient details"),
          field("Name:", "patient.name"),
          field("Patient ID:", "patient.code"),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Age: ", bold: true }),
              new TextRun({ text: "{{patient.age}}     " }),
              new TextRun({ text: "Sex: ", bold: true }),
              new TextRun({ text: "{{patient.sex}}     " }),
              new TextRun({ text: "Marital Status: ", bold: true }),
              new TextRun({ text: "{{patient.maritalStatus}}" }),
            ],
          }),
          field("Contact no.:", "patient.phone"),
          field("Email:", "patient.email"),
          field("Occupation:", "patient.occupation"),
          field("Address:", "patient.address"),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Emergency contact: ", bold: true }),
              new TextRun({ text: "{{emergency.name}} / {{emergency.phone}} / {{emergency.relationship}}" }),
            ],
          }),
          heading("Presenting concern"),
          blank("Reason for seeking counselling", "presentingConcern"),
          blank("Onset / triggers", "onsetTriggers"),
          blank("Severity (1–10) / how it's affecting life", "severityImpact"),
          blank("Prior therapy / medications", "priorTherapy"),
          heading("Mental health screening"),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Mood: ", bold: true }),
              new TextRun({ text: "{{mh.mood}}    " }),
              new TextRun({ text: "Sleep: ", bold: true }),
              new TextRun({ text: "{{mh.sleep}}    " }),
              new TextRun({ text: "Appetite: ", bold: true }),
              new TextRun({ text: "{{mh.appetite}}" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Substance use: ", bold: true }),
              new TextRun({
                text:
                  "{{mh.alcohol}} Alcohol    {{mh.tobacco}} Tobacco    {{mh.other}} Other — {{mh.otherText}}",
              }),
            ],
          }),
          blank("Risk: thoughts of self-harm / harm to others", "riskNotes"),
          heading("Goals"),
          blank("Primary goal", "primaryGoal"),
          blank("Secondary goals", "secondaryGoals"),
          heading("Consent"),
          checkboxLine(
            "I understand sessions are confidential except where mandated reporting applies.",
            "consent.confidentiality",
          ),
          checkboxLine("I accept the cancellation and refund policy.", "consent.cancellation"),
          checkboxLine(
            "I confirm the information above is accurate to the best of my knowledge.",
            "consent.truth",
          ),
          new Paragraph({ spacing: { before: 200 } }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Patient signature: ", bold: true }),
              new TextRun({ text: "{{%patientSignature}}" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Counsellor: ", bold: true }),
              new TextRun({ text: "{{therapist.name}}    " }),
              new TextRun({ text: "Signature: ", bold: true }),
              new TextRun({ text: "{{%consultantSignature}}" }),
            ],
          }),
        ],
      },
    ],
  });
}

// ─── Functional Assessment Battery (FAB) ────────────────────
function fab(): Document {
  return new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "FUNCTIONAL ASSESSMENT BATTERY", bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Movement By Design — Colaba", italics: true })],
          }),
          blank("Date", "visitDate"),
          heading("Patient details"),
          field("Name:", "patient.name"),
          field("Patient ID:", "patient.code"),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Age: ", bold: true }),
              new TextRun({ text: "{{patient.age}}     " }),
              new TextRun({ text: "Sex: ", bold: true }),
              new TextRun({ text: "{{patient.sex}}     " }),
              new TextRun({ text: "Dominance: ", bold: true }),
              new TextRun({ text: "{{patient.dominance}}" }),
            ],
          }),
          field("Sport / activity:", "patient.sport"),
          field("Attending coach / physiotherapist:", "therapist.name"),
          heading("Anthropometry & vitals"),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Weight (kg): ", bold: true }),
              new TextRun({ text: "{{vitals.weightKg}}    " }),
              new TextRun({ text: "Height (cm): ", bold: true }),
              new TextRun({ text: "{{vitals.heightCm}}    " }),
              new TextRun({ text: "BMI: ", bold: true }),
              new TextRun({ text: "{{vitals.bmi}}" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Resting HR: ", bold: true }),
              new TextRun({ text: "{{vitals.pulseBpm}} bpm    " }),
              new TextRun({ text: "BP: ", bold: true }),
              new TextRun({ text: "{{vitals.bp}}    " }),
              new TextRun({ text: "SpO2: ", bold: true }),
              new TextRun({ text: "{{vitals.spo2}} %" }),
            ],
          }),
          heading("Functional Movement Screen (FMS)"),
          new Table({
            rows: [
              row("No.", "Test", "Score (0–3)", "Notes"),
              loopRow("fmsRows", ["index", "test", "score", "notes"]),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
            ],
          }),
          heading("Strength tests"),
          new Table({
            rows: [
              row("Test", "Right", "Left", "Notes"),
              loopRow("strengthRows", ["test", "right", "left", "notes"]),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
            ],
          }),
          heading("Power & speed tests"),
          new Table({
            rows: [
              row("Test", "Trial 1", "Trial 2", "Best"),
              loopRow("powerRows", ["test", "trial1", "trial2", "best"]),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
              row("", "", "", ""),
            ],
          }),
          heading("Cardio / capacity"),
          new Table({
            rows: [
              row("Test", "Result", "Notes"),
              loopRow("cardioRows", ["test", "result", "notes"]),
              row("", "", ""),
              row("", "", ""),
              row("", "", ""),
              row("", "", ""),
            ],
          }),
          heading("Findings & recommendations"),
          blank("Strengths", "findings.strengths"),
          blank("Limitations", "findings.limitations"),
          blank("Risk factors", "findings.risks"),
          blank("Programme recommendation", "findings.programme"),
          new Paragraph({ spacing: { before: 200 } }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Assessor: ", bold: true }),
              new TextRun({ text: "{{therapist.name}}    " }),
              new TextRun({ text: "Signature: ", bold: true }),
              new TextRun({ text: "{{%consultantSignature}}" }),
            ],
          }),
        ],
      },
    ],
  });
}

async function writeDoc(doc: Document, filename: string): Promise<void> {
  const buf = await Packer.toBuffer(doc);
  const out = path.join(TEMPLATES_ROOT, filename);
  await fs.writeFile(out, buf);
  console.log(`[build-new-templates] wrote ${filename} (${buf.byteLength} bytes)`);
}

async function main(): Promise<void> {
  await writeDoc(yogaIntake(), "WELLNESS_YOGA_INTAKE.docx");
  await writeDoc(counsellingIntake(), "COUNSELLING_INTAKE.docx");
  await writeDoc(fab(), "FAB.docx");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
