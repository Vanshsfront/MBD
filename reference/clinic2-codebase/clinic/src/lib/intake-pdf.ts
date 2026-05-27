import jsPDF from "jspdf";
import { MBD_LOGO_BASE64 } from "./mbd-logo";

export interface IntakeFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dob: string;
  age: string;
  sex: string;
  dominance: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  emergencyName: string;
  emergencyPhone: string;
  referredBy: string;
  selectedServiceNames: string[];
  chiefComplaints: string;
  knownAllergies: string;
  currentMedications: string;
  pastMedicalHistory: string;
  visitReasons?: string[];
  visitDateTime?: string;
  othersText?: string;
  consentAssess?: boolean;
  consentTerms?: boolean;
  frontOfficeExec?: string;
  assignedTherapists?: Array<{ name: string }>;
}

// ── Visit reason options matching the PDF ────────────────────────────────
const VISIT_OPTIONS = [
  "Pain/ Injury",
  "Physiotherapy",
  "Strength &\nConditioning",
  "Sports / Deep\nTissue / Massage\nTherapy",
  "Wellness Yoga",
  "Nutrition\nGuidance",
  "Counselling /\nStress Support",
  "Preventive /\nWellness\nConsultation",
];

// Map from form values to display values
const REASON_MAP: Record<string, string> = {
  "Pain/Injury": "Pain/ Injury",
  "Physiotherapy": "Physiotherapy",
  "Strength Conditioning & Training": "Strength &\nConditioning",
  "Sports/Deep Tissue/Massage Therapy": "Sports / Deep\nTissue / Massage\nTherapy",
  "Wellness Yoga": "Wellness Yoga",
  "Nutrition Guidance": "Nutrition\nGuidance",
  "Counselling & Stress Support": "Counselling /\nStress Support",
  "Preventive Wellness Consultation": "Preventive /\nWellness\nConsultation",
};

// ── Helper: draw a labelled field ─────────────────────────────────────
function drawField(doc: jsPDF, x: number, y: number, label: string, value: string, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30);
  const displayVal = value || "";
  doc.text(displayVal, x, y + 4.5);
  // underline
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(x, y + 5.5, x + width, y + 5.5);
}

// ── Helper: checkbox ──────────────────────────────────────────────────
function drawCheckbox(doc: jsPDF, x: number, y: number, checked: boolean, label: string, maxWidth: number) {
  const boxSize = 3.5;
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.rect(x, y - boxSize + 0.5, boxSize, boxSize);
  if (checked) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30);
    doc.text("✓", x + 0.6, y);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(50);
  const lines = doc.splitTextToSize(label, maxWidth);
  doc.text(lines, x + boxSize + 2, y);
}

// ── Main PDF Generator ──────────────────────────────────────────────────
export function generateIntakePDF(data: IntakeFormData): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // ────────────────────────────────────────────────────────────────────
  // PAGE 1: COMMON PATIENT INTAKE FORM
  // ────────────────────────────────────────────────────────────────────

  // Logo (centered top)
  try {
    const logoW = 30;
    const logoH = 23;
    doc.addImage(MBD_LOGO_BASE64, "PNG", (pageWidth - logoW) / 2, 6, logoW, logoH);
  } catch { /* fallback if logo fails */ }

  // Title
  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("COMMON PATIENT INTAKE FORM", pageWidth / 2, y, { align: "center" });

  // Date
  y += 8;
  const visitDate = data.visitDateTime ? new Date(data.visitDateTime) : new Date();
  const dateStr = visitDate.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = visitDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(`Date: ${dateStr}`, margin, y);

  // ── PATIENT INFORMATION section ──
  y += 8;
  doc.setFillColor(235, 240, 248);
  doc.rect(margin, y - 4, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("PATIENT INFORMATION", margin + 3, y);

  y += 10;
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  drawField(doc, margin, y, "Name", fullName, contentWidth);

  y += 12;
  const halfW = (contentWidth - 8) / 2;
  drawField(doc, margin, y, "Date of Birth", data.dob || "", halfW);
  drawField(doc, margin + halfW + 8, y, "Age", data.age ? `${data.age} years` : "", 25);

  y += 12;
  drawField(doc, margin, y, "Sex", data.sex || "", 30);
  drawField(doc, margin + 40, y, "Contact Number", data.phone ? `+91 ${data.phone}` : "", halfW);

  y += 12;
  const addressParts = [data.addressLine1, data.addressLine2, data.city, data.pincode].filter(Boolean);
  drawField(doc, margin, y, "Address", addressParts.join(", "), contentWidth);

  y += 12;
  drawField(doc, margin, y, "Email ID", data.email || "", halfW);
  drawField(doc, margin + halfW + 8, y, "Time of Visit", timeStr, halfW - 8);

  y += 12;
  drawField(doc, margin, y, "Emergency Contact Name & Number", 
    [data.emergencyName, data.emergencyPhone ? `+91 ${data.emergencyPhone}` : ""].filter(Boolean).join("  —  "),
    contentWidth);

  // ── What brings you to MBD today? ──
  y += 16;
  doc.setFillColor(235, 240, 248);
  doc.rect(margin, y - 4, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text("What brings you to MBD today?  (Select all that apply)", margin + 3, y);

  y += 8;

  // Draw checkbox grid (2 rows × 4 cols)
  const colWidth = contentWidth / 4;
  const selectedReasons = data.visitReasons || [];
  
  for (let i = 0; i < VISIT_OPTIONS.length; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = margin + col * colWidth;
    const cy = y + row * 16;

    const displayLabel = VISIT_OPTIONS[i];
    // Find if this is selected by mapping
    const matchKey = Object.entries(REASON_MAP).find(([, v]) => v === displayLabel);
    const isChecked = matchKey ? selectedReasons.includes(matchKey[0]) : false;

    drawCheckbox(doc, cx, cy, isChecked, displayLabel, colWidth - 8);
  }

  y += 34;

  // Others
  const hasOthers = selectedReasons.includes("Others");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  doc.text("Others: (Please specify below)", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30);
  if (hasOthers && data.othersText) {
    doc.text(data.othersText, margin, y);
  }
  doc.setDrawColor(180);
  doc.line(margin, y + 2, margin + contentWidth, y + 2);
  doc.line(margin, y + 8, margin + contentWidth, y + 8);

  // ── Signature Block ──
  y += 20;
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  
  // Left side
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  doc.text("Patient Signature:", margin, y);
  doc.line(margin, y + 12, margin + 60, y + 12);

  // Right side
  const rx = margin + contentWidth / 2 + 10;
  const assignedNames = (data.assignedTherapists || []).map(t => t.name).join(", ");
  doc.text("Assigned to:", rx, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30);
  if (assignedNames) {
    doc.text(assignedNames, rx + 20, y + 1);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);
  doc.line(rx + 20, y + 2, rx + 75, y + 2);
  
  doc.text("Assigned by:", rx, y + 8);
  doc.line(rx + 20, y + 9, rx + 75, y + 9);
  
  doc.text("Front Office Executive:", rx, y + 16);
  doc.line(rx, y + 22, rx + 75, y + 22);
  if (data.frontOfficeExec) {
    doc.setFont("helvetica", "normal");
    doc.text(data.frontOfficeExec, rx, y + 21);
  }


  // ────────────────────────────────────────────────────────────────────
  // PAGE 2: INFORMED CONSENT AND CLINIC POLICIES
  // ────────────────────────────────────────────────────────────────────
  doc.addPage();

  // Logo again
  try {
    const logoW = 30;
    const logoH = 23;
    doc.addImage(MBD_LOGO_BASE64, "PNG", (pageWidth - logoW) / 2, 6, logoW, logoH);
  } catch { /* fallback */ }

  y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("INFORMED CONSENT AND CLINIC POLICIES", pageWidth / 2, y, { align: "center" });

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(`Date: ${dateStr}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text("Please read carefully and confirm:", margin, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(50);

  const consentParagraphs = [
    "I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge. I voluntarily consent to the collection, storage, and use of my personal and health information for the purposes of appointment scheduling, clinical assessment, and the provision of healthcare services. I understand that my information will be kept confidential and handled securely in accordance with applicable privacy and data protection regulations by Team MBD.",
    "I understand that services at MBD include, but are not limited to, physiotherapy, strength & conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness. I acknowledge that outcomes may vary between individuals and that no guarantee of specific results has been promised.",
    "I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions.",
  ];

  for (const para of consentParagraphs) {
    const lines = doc.splitTextToSize(para, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 3;
  }

  // Terms & Clinic Policies
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text("Terms & Clinic Policies:", margin, y);

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(50);

  const termsIntro = "I understand that packages and services have defined durations and validity periods as explained to me. I understand that in accordance with the cancellation policy:";
  const termsLines = doc.splitTextToSize(termsIntro, contentWidth);
  doc.text(termsLines, margin, y);
  y += termsLines.length * 3.5 + 3;

  const cancelPolicies = [
    "(a) Appointments must be cancelled at least 4 hours in advance.",
    "(b) For pre-noon appointments, cancellations must be informed before 08:00 PM the previous day.",
    "(c) I understand that late cancellations or no-shows may result in session deduction.",
  ];

  for (const policy of cancelPolicies) {
    doc.text(policy, margin + 4, y);
    y += 5;
  }

  // Consent checkboxes
  y += 6;
  drawCheckbox(doc, margin, y, data.consentAssess || false,
    "I hereby consent to being assessed and guided by MBD's team of professionals and physician-led team based on professional judgement.", contentWidth - 10);

  y += 10;
  drawCheckbox(doc, margin, y, data.consentTerms || false,
    "I have read, understood, and agree to all above terms & policies.", contentWidth - 10);

  // Signature block
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(60);

  doc.text("Patient Name:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.firstName} ${data.lastName}`, margin + 25, y);
  doc.setDrawColor(180);
  doc.line(margin + 25, y + 1, margin + contentWidth / 2, y + 1);

  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text("Signature of Patient & Date:", margin, y);
  doc.line(margin, y + 10, margin + 70, y + 10);

  // Right side - FO Executive
  doc.text("Front Office Executive:", margin + contentWidth / 2 + 10, y);
  doc.line(margin + contentWidth / 2 + 10, y + 10, margin + contentWidth, y + 10);

  // ── Footer on each page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(150);
    doc.text(
      `Movement By Design — Patient Intake Form — Page ${i} of ${pageCount}`,
      pageWidth / 2, 290, { align: "center" }
    );
    doc.setTextColor(0);
  }

  return doc.output("dataurlstring");
}
