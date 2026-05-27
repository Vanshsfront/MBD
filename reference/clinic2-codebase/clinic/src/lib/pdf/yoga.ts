import jsPDF from "jspdf";
import { pdfHeader, pdfFooter, sectionHeader, field, checkbox, patientInfoBlock, wrappedText } from "./helpers";

export interface YogaPDFData {
  date: string; patientName: string; patientId: string; age: string; sex: string;
  dominance: string; contactNo: string; occupation?: string; email?: string;
  address?: string; attendingTherapist?: string;
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
  conditionsYn?: "yes" | "no" | ""; conditionsDetails?: string;
  injuryYn?: "yes" | "no" | ""; injuryDetails?: string;
  medications?: string;
  exerciseYn?: "yes" | "no" | ""; activityType?: string; daysPerWeek?: string;
  sleepQuality?: string; stressLevel?: string; physicalLimitations?: string;
  practicedYn?: "yes" | "no" | ""; level?: string; yogaType?: string; practiceDuration?: string;
  goals?: string[]; focusAreas?: string;
  sessionType?: string;
  consentTrue?: boolean; consentDisclose?: boolean; consentNotMedical?: boolean;
  therapistNotes?: string;
}

export function generateYogaPDF(data: YogaPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = 14;
  pdfHeader(doc, "WELLNESS YOGA INTAKE FORM");
  let y = 30;

  y = sectionHeader(doc, y, "PATIENT INFORMATION");
  y = patientInfoBlock(doc, y, { ...data, attendingTherapist: data.attendingTherapist, email: data.email, emergencyContact: data.emergencyContact });

  // Medical History
  y = sectionHeader(doc, y, "MEDICAL HISTORY");
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("1. Any current or pre-existing medical condition?", m, y);
  checkbox(doc, 100, y, data.conditionsYn === "yes", "Yes");
  checkbox(doc, 120, y, data.conditionsYn === "no", "No"); y += 5;
  if (data.conditionsDetails) { doc.setFont("helvetica", "normal"); y = wrappedText(doc, m, y, data.conditionsDetails); }

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("2. Have you had any recent injuries or surgery?", m, y);
  checkbox(doc, 100, y, data.injuryYn === "yes", "Yes");
  checkbox(doc, 120, y, data.injuryYn === "no", "No"); y += 5;
  if (data.injuryDetails) { doc.setFont("helvetica", "normal"); y = wrappedText(doc, m, y, data.injuryDetails); }

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("3. Any current medications?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.medications || "");

  // Physical Activity & Lifestyle
  y = sectionHeader(doc, y, "PHYSICAL ACTIVITY & LIFESTYLE");
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("1. Do you exercise regularly?", m, y);
  checkbox(doc, 65, y, data.exerciseYn === "yes", "Yes");
  checkbox(doc, 85, y, data.exerciseYn === "no", "No"); y += 6;
  doc.setFont("helvetica", "normal");
  field(doc, m, y, "2. Type of activity", data.activityType || "", 36); y += 6;
  field(doc, m, y, "3. Days per week", data.daysPerWeek || "", 32); y += 6;

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("4. Sleep Quality:", m, y);
  checkbox(doc, 42, y, data.sleepQuality === "poor", "Poor");
  checkbox(doc, 62, y, data.sleepQuality === "intermediate", "Intermediate");
  checkbox(doc, 95, y, data.sleepQuality === "good", "Good"); y += 6;

  doc.text("5. Stress Level:", m, y);
  checkbox(doc, 40, y, data.stressLevel === "low", "Low");
  checkbox(doc, 60, y, data.stressLevel === "moderate", "Moderate");
  checkbox(doc, 88, y, data.stressLevel === "high", "High"); y += 6;
  doc.setFont("helvetica", "normal");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("6. Any physical limitations or discomfort?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.physicalLimitations || "");

  if (y > 240) { doc.addPage(); y = 20; }

  // Yoga Experience
  y = sectionHeader(doc, y, "YOGA EXPERIENCE");
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("1. Have you ever practiced yoga?", m, y);
  checkbox(doc, 72, y, data.practicedYn === "yes", "Yes");
  checkbox(doc, 92, y, data.practicedYn === "no", "No"); y += 6;

  doc.text("2. Level of difficulty:", m, y);
  checkbox(doc, 46, y, data.level === "beginner", "Beginner");
  checkbox(doc, 72, y, data.level === "intermediate", "Intermediate");
  checkbox(doc, 105, y, data.level === "advanced", "Advanced"); y += 6;
  doc.setFont("helvetica", "normal");

  field(doc, m, y, "3. Type of yoga practiced", data.yogaType || "", 46); y += 6;
  field(doc, m, y, "4. Duration of practice", data.practiceDuration || "", 42); y += 8;

  // Goals
  y = sectionHeader(doc, y, "GOALS & EXPECTATIONS");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("1. What are your goals for yoga?", m, y); y += 5;
  doc.setFont("helvetica", "normal");
  const goals = data.goals || [];
  for (let i = 0; i < 5; i++) {
    doc.text(`${String.fromCharCode(97 + i)}.`, m, y);
    doc.text(goals[i] || "_______________________________________________", m + 6, y);
    y += 5;
  }
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("2. Any specific areas you want to focus on?", m, y); y += 4;
  doc.setFont("helvetica", "normal");
  y = wrappedText(doc, m, y, data.focusAreas || "");

  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("3. Preferred session type:", m, y);
  checkbox(doc, 52, y, data.sessionType === "personal", "Personal (1:1)");
  checkbox(doc, 92, y, data.sessionType === "duo", "Group of Two");
  checkbox(doc, 132, y, data.sessionType === "trio", "Group of Three"); y += 10;
  doc.setFont("helvetica", "normal");

  if (y > 240) { doc.addPage(); y = 20; }

  // Consent
  y = sectionHeader(doc, y, "CONSENT");
  doc.setFontSize(7);
  checkbox(doc, m, y, !!data.consentTrue, "I confirm that the information provided is true. I understand that yoga involves physical movement which may carry risk."); y += 8;
  checkbox(doc, m, y, !!data.consentDisclose, "It is my responsibility to disclose injuries, conditions, pain, or discomfort before and during sessions."); y += 8;
  checkbox(doc, m, y, !!data.consentNotMedical, "Yoga instruction is not a substitute for medical treatment; I have been advised to consult a healthcare professional if needed."); y += 10;

  // Therapist Notes
  y = sectionHeader(doc, y, "THERAPIST NOTES");
  y = wrappedText(doc, m, y, data.therapistNotes || "");

  // Signatures
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setDrawColor(200);
  doc.line(m, y, m + 70, y); doc.line(120, y, 196, y); y += 5;
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Signature of Patient & Date", m, y);
  doc.text("Signature of Yoga Therapist & Date", 120, y);

  pdfFooter(doc);
  return doc;
}
