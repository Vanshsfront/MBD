import jsPDF from "jspdf";

export interface ConsentFormData {
  // Patient demographics
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dob: string;
  age: string;
  sex: string;
  contactNumber: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  visitReasons: string[];
  visitDateTime: string;

  // Assignment info
  assignedTo: string;
  assignedBy: string;
  frontOfficeExec: string;

  // Selected services
  selectedServiceNames: string[];

  // Optional base64 PNG signature to embed at the patient signature line.
  // When present, the PDF is watermarked "DIGITALLY SIGNED — DRAFT (NOT LEGAL E-SIGN)".
  signatureDataUrl?: string | null;
}

function sectionHeader(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(15, 23, 42);
  doc.rect(14, y - 4, 182, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 16, y + 1);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  return y + 10;
}

function labelValue(doc: jsPDF, x: number, y: number, label: string, value: string, labelWidth = 35): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(value || "____________________", x + labelWidth, y);
  return y;
}

function drawLine(doc: jsPDF, x: number, y: number, width: number) {
  doc.setDrawColor(180, 180, 180);
  doc.line(x, y, x + width, y);
}

function drawCheckmark(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.45);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  // Short stroke going down-right
  doc.line(x + size * 0.18, y + size * 0.52, x + size * 0.42, y + size * 0.78);
  // Long stroke going up-right
  doc.line(x + size * 0.42, y + size * 0.78, x + size * 0.88, y + size * 0.20);
  doc.setLineWidth(0.3);
}

function checkPage(doc: jsPDF, y: number, needed: number = 30): number {
  if (y + needed > 275) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function generateConsentPDF(data: ConsentFormData): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // ── Page 1: Patient Intake Form ──────────────────────────────────

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text("COMMON PATIENT INTAKE FORM", pageWidth / 2, 18, { align: "center" });

  // Date line
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Date: ${data.visitDateTime || new Date().toLocaleDateString("en-IN")}`, pageWidth - margin, 26, { align: "right" });
  doc.setTextColor(0);

  let y = 34;

  // ── Patient Information ──
  y = sectionHeader(doc, y, "PATIENT INFORMATION");

  labelValue(doc, margin, y, "Name", `${data.firstName} ${data.lastName}`, 14);
  labelValue(doc, 120, y, "Date of Birth", data.dob || "", 28);
  y += 7;

  labelValue(doc, margin, y, "Age", data.age || "", 10);
  labelValue(doc, 55, y, "Sex", data.sex || "", 10);
  labelValue(doc, 100, y, "Contact Number", data.phone || "", 32);
  y += 7;

  labelValue(doc, margin, y, "Address", data.address || "", 16);
  y += 7;

  labelValue(doc, margin, y, "Email ID", data.email || "", 18);
  labelValue(doc, 120, y, "Time of Visit", data.visitDateTime ? new Date(data.visitDateTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "", 25);
  y += 7;

  labelValue(doc, margin, y, "Emergency Contact", `${data.emergencyName || ""} ${data.emergencyPhone ? "- " + data.emergencyPhone : ""}`.trim(), 36);
  y += 10;

  // ── Visit Reasons ──
  y = checkPage(doc, y, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("What brings you to MBD today?  (Select all that apply)", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0);
  y += 3;

  const allReasons = [
    "Pain / Injury", "Physiotherapy", "Strength & Conditioning",
    "Sports / Deep Tissue / Massage Therapy", "Wellness Yoga",
    "Nutrition Guidance", "Counselling / Stress Support",
    "Preventive / Wellness Consultation"
  ];

  const reasonCols = 2;
  const reasonColWidth = contentWidth / reasonCols;
  for (let i = 0; i < allReasons.length; i += reasonCols) {
    y += 6;
    y = checkPage(doc, y, 8);
    for (let c = 0; c < reasonCols && i + c < allReasons.length; c++) {
      const reason = allReasons[i + c];
      const isSelected = data.visitReasons.some(r =>
        r.toLowerCase().includes(reason.toLowerCase().split("/")[0].trim().toLowerCase())
      );
      const xPos = margin + c * reasonColWidth;

      // Checkbox — 3.5mm square, tick centered inside
      doc.setDrawColor(60);
      doc.setLineWidth(0.3);
      doc.rect(xPos, y - 3, 3.5, 3.5);
      if (isSelected) {
        drawCheckmark(doc, xPos, y - 3, 3.5);
      }
      doc.setFontSize(8);
      doc.text(reason, xPos + 5.5, y - 0.5);
    }
  }
  y += 12;

  // ── Page 2: Informed Consent ─────────────────────────────────────
  y = checkPage(doc, y, 120);
  if (y < 30) {
    // We're on a new page already
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("INFORMED CONSENT AND CLINIC POLICIES", pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(`Date: ${data.visitDateTime || new Date().toLocaleDateString("en-IN")}`, pageWidth - margin, y, { align: "right" });
  doc.setTextColor(0);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Please read carefully and confirm:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 5;

  // Consent paragraphs
  const consentParagraphs = [
    "I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge. I voluntarily consent to the collection, storage, and use of my personal and health information for the purposes of appointment scheduling, clinical assessment, and the provision of healthcare services. I understand that my information will be kept confidential and handled securely in accordance with applicable privacy and data protection regulations by Team MBD.",
    "I understand that services at MBD include, but are not limited to, physiotherapy, strength & conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness. I acknowledge that outcomes may vary between individuals and that no guarantee of specific results has been promised.",
    "I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions."
  ];

  doc.setFontSize(8);
  for (const para of consentParagraphs) {
    y = checkPage(doc, y, 25);
    const lines = doc.splitTextToSize(para, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.8 + 4;
  }

  // Terms & Policies
  y = checkPage(doc, y, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Terms & Clinic Policies:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  y += 5;

  const policyPoints = [
    "I understand that packages and services have defined durations and validity periods as explained to me.",
    "I understand that in accordance with the cancellation policy:",
    "    Appointments must be cancelled at least 4 hours in advance.",
    "    For pre-noon appointments, cancellations must be informed before 08:00 PM the previous day.",
    "I understand that late cancellations or no-shows may result in session deduction."
  ];

  for (const point of policyPoints) {
    y = checkPage(doc, y, 6);
    const lines = doc.splitTextToSize(point, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.8 + 2;
  }

  y += 3;
  y = checkPage(doc, y, 12);

  // Consent checkboxes
  const consentChecks = [
    "I hereby consent to being assessed and guided by MBD's team of professionals and physician-led team based on professional judgement.",
    "I have read, understood, and agree to all above terms & policies."
  ];

  for (const check of consentChecks) {
    y = checkPage(doc, y, 8);
    doc.setDrawColor(60);
    doc.setLineWidth(0.3);
    doc.rect(margin, y - 3, 3.5, 3.5);
    // Mark as checked
    drawCheckmark(doc, margin, y - 3, 3.5);
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(check, contentWidth - 8);
    doc.text(lines, margin + 6, y - 0.5);
    y += lines.length * 3.8 + 4;
  }

  // ── Signature Section ──
  y += 6;
  y = checkPage(doc, y, 50);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Patient Name:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.firstName} ${data.lastName}`, margin + 30, y);
  y += 12;

  // Two-column signature block
  const colLeft = margin;
  const colRight = pageWidth / 2 + 10;

  // Left column - Patient
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Patient Signature:", colLeft, y);
  y += 3;
  if (data.signatureDataUrl) {
    try {
      doc.addImage(data.signatureDataUrl, "PNG", colLeft, y + 1, 60, 18);
      doc.setFontSize(6);
      doc.setTextColor(200, 100, 0);
      doc.text("DRAFT — not a legal e-signature (no DocuSign certificate)", colLeft, y + 22);
      doc.setTextColor(0);
    } catch {
      // If embedding fails, fall back to blank line
    }
  }
  drawLine(doc, colLeft, y + 12, 70);
  y += 2;

  // Right column - Assignment info
  const yRight = y - 5;
  labelValue(doc, colRight, yRight, "Assigned to", data.assignedTo || "", 24);
  labelValue(doc, colRight, yRight + 8, "Assigned by", data.assignedBy || "", 24);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Front Office Executive:", colRight, yRight + 18);
  doc.setFont("helvetica", "normal");
  doc.text(data.frontOfficeExec || "", colRight + 42, yRight + 18);

  y += 20;
  drawLine(doc, colRight, y, 70);

  // ── Footer on each page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Blue accent line at top
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 1.5, "F");

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(150);
    doc.text(
      `Movement By Design \u2014 Patient Consent Form \u2014 Page ${i} of ${pageCount}`,
      pageWidth / 2, 290, { align: "center" }
    );
    doc.setTextColor(0);
  }

  return doc.output("dataurlstring");
}
