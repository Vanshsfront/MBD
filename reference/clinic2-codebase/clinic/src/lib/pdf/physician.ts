import jsPDF from "jspdf";
import { pdfHeader, pdfFooter, sectionHeader, field, checkbox, patientInfoBlock, wrappedText } from "./helpers";

export interface PhysicianPDFData {
  date: string; patientName: string; patientId: string; age: string; sex: string;
  dominance: string; contactNo: string; address?: string;
  bodyWeight?: string; height?: string; bmi?: string; spo2?: string;
  pulseRate?: string; bpSystolic?: string; bpDiastolic?: string;
  comorbidities?: { dm?: boolean; htn?: boolean; cad?: boolean; pcos?: boolean; thyroid?: string; other?: string };
  knownAllergies?: string;
  chiefComplaints?: string; pastMedicalHistory?: string; pastSurgicalHistory?: string;
  familyHistory?: string;
  personalHistory?: { sleep?: string; dietAppetite?: string; bowelBladder?: string; others?: string };
  diagnosis?: string;
  labInvestigations?: { cbc?: boolean; rft?: boolean; lft?: boolean; tft?: boolean; lipid?: boolean; cmp?: boolean; hba1c?: boolean; crp?: boolean; urinalysis?: boolean; other?: string };
  diagnosticImaging?: { xray?: string; mri?: string; ct?: string; usg?: string; ecg?: string; dexa?: string; other?: string };
  currentMedications?: string; planOfCare?: string; followUp?: string;
  internalReferral?: { physio?: boolean; sc?: boolean; massage?: boolean; nutrition?: boolean; counselling?: boolean; yoga?: boolean };
  qualifiedForWellness?: "yes" | "no" | "";
}

export function generatePhysicianPDF(data: PhysicianPDFData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = 14;
  pdfHeader(doc, "PHYSICIAN CONSULTATION");
  let y = 30;

  // Patient Info
  y = sectionHeader(doc, y, "PATIENT INFORMATION");
  y = patientInfoBlock(doc, y, data);

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
  const c = data.comorbidities || {};
  doc.setFontSize(8);
  checkbox(doc, m, y, !!c.dm, "DM"); checkbox(doc, 35, y, !!c.htn, "HTN");
  checkbox(doc, 55, y, !!c.cad, "CAD"); checkbox(doc, 75, y, !!c.pcos, "PCOS");
  checkbox(doc, 100, y, !!c.thyroid, `Thyroid (${c.thyroid || "—"})`);
  if (c.other) doc.text(`Other: ${c.other}`, 145, y);
  y += 6;
  field(doc, m, y, "Known Allergies", data.knownAllergies || "None reported", 30); y += 10;

  // Chief Complaints
  y = sectionHeader(doc, y, "CHIEF COMPLAINTS");
  y = wrappedText(doc, m, y, data.chiefComplaints || "");

  // Past Medical/Surgical/Family History
  y = sectionHeader(doc, y, "PAST MEDICAL HISTORY");
  y = wrappedText(doc, m, y, data.pastMedicalHistory || "");
  y = sectionHeader(doc, y, "PAST SURGICAL HISTORY");
  y = wrappedText(doc, m, y, data.pastSurgicalHistory || "");
  y = sectionHeader(doc, y, "FAMILY HISTORY");
  y = wrappedText(doc, m, y, data.familyHistory || "");

  // Personal History
  y = sectionHeader(doc, y, "PERSONAL HISTORY");
  const ph = data.personalHistory || {};
  field(doc, m, y, "Sleep", ph.sleep || "", 14); y += 5;
  field(doc, m, y, "Diet & Appetite", ph.dietAppetite || "", 30); y += 5;
  field(doc, m, y, "Bowel/Bladder", ph.bowelBladder || "", 28); y += 5;
  if (ph.others) { field(doc, m, y, "Others", ph.others, 14); y += 5; }
  y += 4;

  if (y > 240) { doc.addPage(); y = 20; }

  // Diagnosis
  y = sectionHeader(doc, y, "DIAGNOSIS");
  y = wrappedText(doc, m, y, data.diagnosis || "");

  // Lab Investigations
  y = sectionHeader(doc, y, "LAB INVESTIGATIONS");
  const lab = data.labInvestigations || {};
  doc.setFontSize(8);
  checkbox(doc, m, y, !!lab.cbc, "CBC"); checkbox(doc, 40, y, !!lab.rft, "Renal Function Test");
  checkbox(doc, 90, y, !!lab.lft, "Liver Function Test"); y += 5;
  checkbox(doc, m, y, !!lab.tft, "Thyroid Function Test"); checkbox(doc, 60, y, !!lab.lipid, "Lipid Profile");
  checkbox(doc, 110, y, !!lab.cmp, "CMP"); y += 5;
  checkbox(doc, m, y, !!lab.hba1c, "HbA1c"); checkbox(doc, 40, y, !!lab.crp, "CRP");
  checkbox(doc, 70, y, !!lab.urinalysis, "Urinalysis"); y += 5;
  if (lab.other) { field(doc, m, y, "Other", lab.other, 14); y += 5; }
  y += 4;

  // Diagnostic Imaging
  const di = data.diagnosticImaging || {};
  y = sectionHeader(doc, y, "DIAGNOSTIC IMAGING");
  if (di.xray) { field(doc, m, y, "X-Ray", di.xray, 14); y += 5; }
  if (di.mri) { field(doc, m, y, "MRI", di.mri, 10); y += 5; }
  if (di.ct) { field(doc, m, y, "CT", di.ct, 8); y += 5; }
  if (di.usg) { field(doc, m, y, "USG/US", di.usg, 14); y += 5; }
  if (di.ecg) { field(doc, m, y, "ECG", di.ecg, 10); y += 5; }
  if (di.dexa) { field(doc, m, y, "DEXA Scan", di.dexa, 20); y += 5; }
  if (di.other) { field(doc, m, y, "Other", di.other, 14); y += 5; }
  y += 4;

  if (y > 240) { doc.addPage(); y = 20; }

  // Current Medications
  y = sectionHeader(doc, y, "CURRENT MEDICATIONS");
  y = wrappedText(doc, m, y, data.currentMedications || "");

  // Plan of Care
  y = sectionHeader(doc, y, "PLAN OF CARE & ADVICE");
  y = wrappedText(doc, m, y, data.planOfCare || "");

  // Follow up
  y = sectionHeader(doc, y, "FOLLOW UP");
  y = wrappedText(doc, m, y, data.followUp || "");

  // Signature
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setDrawColor(200); doc.line(m, y, m + 80, y); y += 5;
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text("Signature of Physician, Date & Stamp", m, y); y += 10;

  // Internal Referral
  const ref = data.internalReferral || {};
  y = sectionHeader(doc, y, "INTERNAL REFERENCE");
  doc.setFontSize(8);
  checkbox(doc, m, y, !!ref.physio, "Physiotherapy"); checkbox(doc, 55, y, !!ref.sc, "Strength & Conditioning"); y += 5;
  checkbox(doc, m, y, !!ref.massage, "Sports / Deep Tissue Massage"); checkbox(doc, 80, y, !!ref.nutrition, "Nutrition Guidance"); y += 5;
  checkbox(doc, m, y, !!ref.counselling, "Counselling & Stress support"); checkbox(doc, 80, y, !!ref.yoga, "Wellness Yoga"); y += 8;

  doc.setFont("helvetica", "bold");
  doc.text("QUALIFIED FOR WELLNESS PROGRAM:", m, y);
  doc.setFont("helvetica", "normal");
  checkbox(doc, 75, y, data.qualifiedForWellness === "yes", "Yes");
  checkbox(doc, 95, y, data.qualifiedForWellness === "no", "No");

  pdfFooter(doc);
  return doc;
}
