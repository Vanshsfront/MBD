import jsPDF from "jspdf";
import { pdfHeader, pdfFooter, sectionHeader, field, checkbox, patientInfoBlock, wrappedText } from "./helpers";

export interface CounsellingPDFData {
  date: string; patientName: string; patientId: string; age: string; sex: string;
  dominance: string; contactNo: string; occupation?: string; email?: string;
  maritalStatus?: string; address?: string; attendingTherapist?: string;
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
  whatBrings?: string; issueOnset?: string; lifeImpact?: string;
  medicalConditions?: string; currentMedications?: string;
  prevCounselling?: "yes" | "no" | ""; prevCounsellingDetails?: string;
  goals?: string[];
  traumaYn?: "yes" | "no" | ""; traumaDetails?: string;
  prevDiagnosisYn?: "yes" | "no" | ""; prevDiagnosisDetails?: string;
  substanceYn?: "yes" | "no" | ""; substanceName?: string; substanceFrequency?: string; substanceQuantity?: string;
  consentVoluntary?: boolean; consentConfidentiality?: boolean; consentLimits?: boolean;
  therapistNotes?: string;
}

export function generateCounsellingPDF(data: CounsellingPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = 14;
  pdfHeader(doc, "COUNSELLING INTAKE FORM");
  let y = 30;

  y = sectionHeader(doc, y, "PATIENT INFORMATION");
  y = patientInfoBlock(doc, y, { ...data, maritalStatus: data.maritalStatus, email: data.email, attendingTherapist: data.attendingTherapist, emergencyContact: data.emergencyContact });

  // Reason for seeking counselling
  y = sectionHeader(doc, y, "REASON FOR SEEKING COUNSELLING");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("1. What brings you to counselling?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.whatBrings || "");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("2. When did the issue start?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.issueOnset || "");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("3. How is it affecting your life?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.lifeImpact || "");

  // Medical History
  y = sectionHeader(doc, y, "MEDICAL HISTORY");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("1. Any current or pre-existing medical condition?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.medicalConditions || "");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("2. Any current medications?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.currentMedications || "");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("3. Previous counselling/therapy experience:", m, y);
  checkbox(doc, 80, y, data.prevCounselling === "yes", "Yes");
  checkbox(doc, 100, y, data.prevCounselling === "no", "No"); y += 5;
  if (data.prevCounsellingDetails) { doc.setFont("helvetica", "normal"); y = wrappedText(doc, m, y, data.prevCounsellingDetails); }

  if (y > 240) { doc.addPage(); y = 20; }

  // Goals
  y = sectionHeader(doc, y, "COUNSELLING GOALS");
  const goals = data.goals || [];
  for (let i = 0; i < 5; i++) {
    doc.setFontSize(8);
    doc.text(`${i + 1}.`, m, y);
    doc.text(goals[i] || "_______________________________________________", m + 6, y);
    y += 6;
  }
  y += 2;

  // Mental Health History
  y = sectionHeader(doc, y, "MENTAL HEALTH HISTORY");
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("1. Have you experienced any traumatic events?", m, y);
  checkbox(doc, 95, y, data.traumaYn === "yes", "Yes");
  checkbox(doc, 115, y, data.traumaYn === "no", "No"); y += 5;
  if (data.traumaDetails) { doc.setFont("helvetica", "normal"); y = wrappedText(doc, m, y, data.traumaDetails); }

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("2. Any previous mental health diagnoses?", m, y);
  checkbox(doc, 85, y, data.prevDiagnosisYn === "yes", "Yes");
  checkbox(doc, 105, y, data.prevDiagnosisYn === "no", "No"); y += 5;
  if (data.prevDiagnosisDetails) { doc.setFont("helvetica", "normal"); y = wrappedText(doc, m, y, data.prevDiagnosisDetails); }

  // Substance Use
  y = sectionHeader(doc, y, "SUBSTANCE USE");
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Do you use any substances? (Alcohol, tobacco, smoking, etc)", m, y);
  checkbox(doc, 120, y, data.substanceYn === "yes", "Yes");
  checkbox(doc, 140, y, data.substanceYn === "no", "No"); y += 6;
  doc.setFont("helvetica", "normal");
  if (data.substanceName) { field(doc, m, y, "Substance", data.substanceName, 22); y += 5; }
  if (data.substanceFrequency) { field(doc, m, y, "Frequency", data.substanceFrequency, 22); y += 5; }
  if (data.substanceQuantity) { field(doc, m, y, "Quantity", data.substanceQuantity, 18); y += 5; }
  y += 4;

  if (y > 240) { doc.addPage(); y = 20; }

  // Consent
  y = sectionHeader(doc, y, "CONSENT");
  doc.setFontSize(7);
  checkbox(doc, m, y, !!data.consentVoluntary, "I confirm that I am voluntarily seeking emotional wellness counselling and consent to participate in counselling sessions."); y += 8;
  checkbox(doc, m, y, !!data.consentConfidentiality, "I understand that information shared will be kept confidential and used only for assessment, support, and treatment."); y += 8;
  checkbox(doc, m, y, !!data.consentLimits, "I understand that confidentiality may be limited when there is a risk of harm to myself or others, or when required by law."); y += 10;

  // Therapist Notes
  y = sectionHeader(doc, y, "THERAPIST NOTES");
  y = wrappedText(doc, m, y, data.therapistNotes || "");

  // Signatures
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setDrawColor(200);
  doc.line(m, y, m + 70, y); doc.line(120, y, 196, y); y += 5;
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Signature of Patient & Date", m, y);
  doc.text("Signature of Counselling Therapist & Date", 120, y);

  pdfFooter(doc);
  return doc;
}
