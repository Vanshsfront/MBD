import jsPDF from "jspdf";
import { pdfHeader, pdfFooter, sectionHeader, field, checkbox, patientInfoBlock, wrappedText, drawPainScale } from "./helpers";

export interface PhysioPDFData {
  date: string; patientName: string; patientId: string; age: string; sex: string;
  dominance: string; contactNo: string; occupation?: string; sport?: string;
  address?: string; attendingPhysiotherapist?: string;
  bodyWeight?: string; height?: string; bmi?: string; spo2?: string;
  pulseRate?: string; bpSystolic?: string; bpDiastolic?: string;
  comorbidities?: { dm?: boolean; htn?: boolean; cad?: boolean; pcos?: boolean; thyroid?: string; other?: string };
  knownAllergies?: string; chiefComplaints?: string; historyOfPresentingIllness?: string;
  painSite?: string; painSide?: string; painOnset?: string;
  painDuration?: string; painDurationDetail?: string;
  painFrequency?: string; painFrequencyDetail?: string;
  painAtRest?: number; painOnMovement?: number;
  aggravatingFactors?: string; relievingFactors?: string;
  pastMedicalHistory?: string; pastInjuryHistory?: string; pastSurgicalHistory?: string;
  familyHistory?: string;
  personalHistory?: { sleep?: string; dietAppetite?: string; bowelBladder?: string; substanceUse?: string };
  investigations?: string; currentMedications?: string;
  differentialDiagnosis?: string; structuresAffected?: string;
  provisionalDiagnosis?: string;
  treatmentDate?: string; exercises?: string; modality?: string;
  adjunct?: string; manualTherapy?: string; therapistNotes?: string;
}

export function generatePhysioPDF(data: PhysioPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = 14;
  pdfHeader(doc, "PHYSIOTHERAPY CONSULTATION");
  let y = 30;

  y = sectionHeader(doc, y, "PATIENT INFORMATION");
  y = patientInfoBlock(doc, y, { ...data, sport: data.sport, attendingTherapist: data.attendingPhysiotherapist });

  // Vitals
  y = sectionHeader(doc, y, "VITALS");
  field(doc, m, y, "Wt", `${data.bodyWeight || "___"} kg`, 8);
  field(doc, 50, y, "Ht", `${data.height || "___"} cm`, 8);
  field(doc, 85, y, "BMI", `${data.bmi || "___"} kg/m²`, 10); y += 6;
  field(doc, m, y, "SpO2", `${data.spo2 || "___"} %`, 12);
  field(doc, 50, y, "PR", `${data.pulseRate || "___"} bpm`, 8);
  field(doc, 85, y, "BP", `${data.bpSystolic || "___"}/${data.bpDiastolic || "___"} mmHg`, 8); y += 10;

  // Comorbidities
  y = sectionHeader(doc, y, "COMORBIDITIES & ALLERGIES");
  const co = data.comorbidities || {};
  doc.setFontSize(8);
  checkbox(doc, m, y, !!co.dm, "DM"); checkbox(doc, 35, y, !!co.htn, "HTN");
  checkbox(doc, 55, y, !!co.cad, "CAD"); checkbox(doc, 75, y, !!co.pcos, "PCOS");
  checkbox(doc, 100, y, !!co.thyroid, `Thyroid (${co.thyroid || "—"})`);
  if (co.other) doc.text(`Other: ${co.other}`, 145, y);
  y += 6;
  field(doc, m, y, "Known Allergies", data.knownAllergies || "None reported", 30); y += 10;

  // Chief Complaints
  y = sectionHeader(doc, y, "CHIEF COMPLAINTS");
  y = wrappedText(doc, m, y, data.chiefComplaints || "");

  // HPI
  y = sectionHeader(doc, y, "HISTORY OF PRESENTING ILLNESS");
  y = wrappedText(doc, m, y, data.historyOfPresentingIllness || "");

  // Pain History
  y = sectionHeader(doc, y, "PAIN HISTORY");
  field(doc, m, y, "Site", data.painSite || "", 10); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("Side:", m, y); doc.setFont("helvetica", "normal");
  checkbox(doc, 30, y, data.painSide === "Right", "Right");
  checkbox(doc, 52, y, data.painSide === "Left", "Left");
  checkbox(doc, 72, y, data.painSide === "Bilateral", "Bilateral"); y += 6;

  doc.setFont("helvetica", "bold"); doc.text("Onset:", m, y); doc.setFont("helvetica", "normal");
  checkbox(doc, 30, y, data.painOnset === "Sudden", "Sudden");
  checkbox(doc, 55, y, data.painOnset === "Gradual", "Gradual");
  checkbox(doc, 82, y, data.painOnset === "Insidious", "Insidious"); y += 6;

  doc.setFont("helvetica", "bold"); doc.text("Duration:", m, y); doc.setFont("helvetica", "normal");
  checkbox(doc, 33, y, data.painDuration === "Acute", "Acute");
  checkbox(doc, 55, y, data.painDuration === "Chronic", "Chronic");
  checkbox(doc, 82, y, data.painDuration === "Acute on Chronic", "Acute on Chronic");
  if (data.painDurationDetail) doc.text(data.painDurationDetail, 130, y); y += 6;

  doc.setFont("helvetica", "bold"); doc.text("Frequency:", m, y); doc.setFont("helvetica", "normal");
  checkbox(doc, 35, y, data.painFrequency === "Constant", "Constant");
  checkbox(doc, 60, y, data.painFrequency === "Intermittent", "Intermittent");
  checkbox(doc, 92, y, data.painFrequency === "On activity", `On activity: ${data.painFrequencyDetail || ""}`); y += 8;

  // VAS
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Intensity (VAS):", m, y); y += 5;
  drawPainScale(doc, m, y, data.painAtRest, "At rest:"); y += 10;
  drawPainScale(doc, m, y, data.painOnMovement, "On movement:"); y += 8;

  field(doc, m, y, "Aggravating Factors", data.aggravatingFactors || "", 35); y += 6;
  field(doc, m, y, "Relieving Factors", data.relievingFactors || "", 35); y += 10;

  if (y > 240) { doc.addPage(); y = 20; }

  // Past histories
  y = sectionHeader(doc, y, "PAST MEDICAL HISTORY");
  y = wrappedText(doc, m, y, data.pastMedicalHistory || "");
  y = sectionHeader(doc, y, "PAST INJURY HISTORY");
  y = wrappedText(doc, m, y, data.pastInjuryHistory || "");
  y = sectionHeader(doc, y, "PAST SURGICAL HISTORY");
  y = wrappedText(doc, m, y, data.pastSurgicalHistory || "");

  if (y > 240) { doc.addPage(); y = 20; }

  // Personal History
  y = sectionHeader(doc, y, "PERSONAL HISTORY");
  const ph = data.personalHistory || {};
  field(doc, m, y, "Sleep", ph.sleep || "", 14); y += 5;
  field(doc, m, y, "Diet & Appetite", ph.dietAppetite || "", 30); y += 5;
  field(doc, m, y, "Bowel/Bladder", ph.bowelBladder || "", 28); y += 5;
  if (ph.substanceUse) { field(doc, m, y, "Substance use", ph.substanceUse, 28); y += 5; }
  y += 4;

  if (data.investigations) { y = sectionHeader(doc, y, "INVESTIGATIONS"); y = wrappedText(doc, m, y, data.investigations); }
  if (data.currentMedications) { y = sectionHeader(doc, y, "CURRENT MEDICATIONS"); y = wrappedText(doc, m, y, data.currentMedications); }

  if (y > 240) { doc.addPage(); y = 20; }

  // Differential Diagnosis
  y = sectionHeader(doc, y, "DIFFERENTIAL DIAGNOSIS");
  y = wrappedText(doc, m, y, data.differentialDiagnosis || "");
  if (data.structuresAffected) {
    field(doc, m, y, "Structures affected", data.structuresAffected, 36); y += 8;
  }

  // Treatment
  y = sectionHeader(doc, y, "INITIAL TREATMENT");
  field(doc, m, y, "Date", data.treatmentDate || data.date, 12); y += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Exercises:", m, y); doc.setFont("helvetica", "normal"); y += 4;
  y = wrappedText(doc, m, y, data.exercises || "");
  field(doc, m, y, "Modality", data.modality || "", 18); y += 6;
  field(doc, m, y, "Adjunct", data.adjunct || "Taping / Dry needling / Cupping", 16); y += 6;
  if (data.manualTherapy) { field(doc, m, y, "Manual Therapy", data.manualTherapy, 28); y += 6; }
  y += 2;

  y = sectionHeader(doc, y, "THERAPIST NOTES");
  y = wrappedText(doc, m, y, data.therapistNotes || "");

  // Signature
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setDrawColor(200); doc.line(m, y, m + 80, y); y += 5;
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Signature of Physiotherapist & Date", m, y);

  pdfFooter(doc);
  return doc;
}
