import jsPDF from "jspdf";

// Generates the two-page MBD patient intake + consent form, matched to the
// printed master at All_formats/Patient Intake Form.pdf.
//
//   Page 1 — patient information block, visit reasons (☑/☐), patient signature
//            and the "Assigned to / Assigned by / Front Office Executive" panel.
//   Page 2 — informed consent + clinic policies + patient & FO signatures.
//
// All field values pull from the assign-tab state. FO signature is the staff
// member's saved default (set at /dashboard/settings/profile). Patient
// signature is captured live in the assign dialog.

export interface IntakeFormPdfData {
  // Patient demographics
  firstName: string;
  lastName: string;
  dob: string;          // displayable date (e.g. "12/04/1990" or ISO; we render as-is)
  age: string;
  sex: string;
  phone: string;
  email: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  visitDate: string;    // for the "Date" lines + page 2 date
  visitTime: string;    // for "Time of Visit"

  // Visit reasons selected on intake (free text; matched against the canonical 8)
  visitReasons: string[];
  otherSpecify?: string;

  // Assignment block — populated after FO selects therapists.
  assignedToNames: string[];   // can be multiple
  assignedByName: string;      // FO who clicked "Assign"
  frontOfficeExecName: string; // signing FO

  // Signatures (base64 PNG data URLs). Either may be null.
  patientSignatureDataUrl?: string | null;
  foSignatureDataUrl?: string | null;
}

// Eight canonical visit-reason boxes printed on the master form.
const REASON_BOXES: string[] = [
  "Pain / Injury",
  "Physiotherapy",
  "Strength & Conditioning",
  "Sports / Deep Tissue / Massage Therapy",
  "Wellness Yoga",
  "Nutrition Guidance",
  "Counselling / Stress Support",
  "Preventive / Wellness Consultation",
];

let cachedLogo: string | null = null;

async function loadLogo(): Promise<string | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch("/mbd-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        cachedLogo = (reader.result as string) || null;
        resolve(cachedLogo);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const PAGE_W = 210;
const M = 18; // outer margin in mm
const CONTENT_W = PAGE_W - M * 2;

function fieldLine(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  totalWidth: number,
  labelGap = 2
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`${label}:`, x, y);
  const labelWidth = doc.getTextWidth(`${label}:`);
  const valueX = x + labelWidth + labelGap;
  const valueW = totalWidth - labelWidth - labelGap;

  // Underline the value area
  doc.setDrawColor(40);
  doc.setLineWidth(0.3);
  doc.line(valueX, y + 1, x + totalWidth, y + 1);

  if (value) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const truncated = doc.splitTextToSize(value, valueW)[0] || "";
    doc.text(truncated, valueX + 1, y - 0.2);
  }
}

function drawCheckbox(doc: jsPDF, x: number, y: number, size: number, checked: boolean) {
  doc.setDrawColor(40);
  doc.setLineWidth(0.5);
  doc.rect(x, y, size, size);
  if (checked) {
    doc.setLineWidth(0.7);
    doc.setLineCap("round");
    doc.line(x + size * 0.18, y + size * 0.55, x + size * 0.42, y + size * 0.8);
    doc.line(x + size * 0.42, y + size * 0.8, x + size * 0.88, y + size * 0.18);
  }
}

function reasonChecked(selected: string[], boxLabel: string): boolean {
  const boxKey = boxLabel.toLowerCase().split("/")[0].trim();
  return selected.some((s) => {
    const lower = s.toLowerCase();
    return lower.includes(boxKey) || boxLabel.toLowerCase().includes(lower);
  });
}

function drawTitle(doc: jsPDF, title: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title, PAGE_W / 2, y, { align: "center" });
  // Underline the title
  const tw = doc.getTextWidth(title);
  doc.setLineWidth(0.5);
  doc.setDrawColor(0);
  doc.line(PAGE_W / 2 - tw / 2, y + 1.5, PAGE_W / 2 + tw / 2, y + 1.5);
}

function drawLogo(doc: jsPDF, logo: string | null) {
  if (!logo) return;
  // Top-right placement, sized to roughly match the reference.
  try {
    doc.addImage(logo, "PNG", PAGE_W - M - 22, 10, 22, 14, undefined, "FAST");
  } catch {
    // Logo embed failed — fall through silently rather than block the PDF.
  }
}

function drawSignatureLine(doc: jsPDF, x: number, y: number, width: number, signature?: string | null) {
  // Embed the signature image above the line if present, then draw the line.
  if (signature) {
    try {
      doc.addImage(signature, "PNG", x, y - 14, Math.min(width, 60), 14, undefined, "FAST");
    } catch {
      // ignore
    }
  }
  doc.setDrawColor(40);
  doc.setLineWidth(0.4);
  doc.line(x, y, x + width, y);
}

export async function generateIntakeFormPDF(data: IntakeFormPdfData): Promise<string> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const logo = await loadLogo();

  // ─────────── PAGE 1 — INTAKE FORM ───────────
  drawLogo(doc, logo);
  drawTitle(doc, "COMMON PATIENT INTAKE FORM", 22);

  // Date (right-aligned)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Date:`, PAGE_W - M - 38, 36);
  doc.setFont("helvetica", "normal");
  doc.setLineWidth(0.3);
  doc.setDrawColor(40);
  doc.line(PAGE_W - M - 28, 37, PAGE_W - M, 37);
  doc.text(data.visitDate || "", PAGE_W - M - 27, 36);

  // Section header — "PATIENT INFORMATION"
  drawTitle(doc, "PATIENT INFORMATION", 50);

  // Patient block
  let y = 64;
  fieldLine(doc, M, y, "Name", `${data.firstName} ${data.lastName}`, CONTENT_W * 0.58 - 4);
  fieldLine(doc, M + CONTENT_W * 0.58, y, "Date of Birth", data.dob, CONTENT_W * 0.42);
  y += 10;

  fieldLine(doc, M, y, "Age", data.age, CONTENT_W * 0.22);
  fieldLine(doc, M + CONTENT_W * 0.24, y, "Sex", data.sex, CONTENT_W * 0.22);
  fieldLine(doc, M + CONTENT_W * 0.5, y, "Contact Number", data.phone, CONTENT_W * 0.5);
  y += 10;

  fieldLine(doc, M, y, "Address", data.address, CONTENT_W);
  y += 10;

  fieldLine(doc, M, y, "Email ID", data.email, CONTENT_W * 0.58 - 4);
  fieldLine(doc, M + CONTENT_W * 0.58, y, "Time of Visit", data.visitTime, CONTENT_W * 0.42);
  y += 10;

  fieldLine(
    doc,
    M,
    y,
    "Emergency Contact Name & Number",
    `${data.emergencyName || ""}${data.emergencyPhone ? "  -  " + data.emergencyPhone : ""}`,
    CONTENT_W
  );
  y += 14;

  // Visit reasons
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("What brings you to MBD today?", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("(Select all that apply)", M + 60, y);
  y += 7;

  // Two columns × 4 rows of checkboxes
  const colW = CONTENT_W / 2;
  const boxSize = 4;
  const rowH = 11;
  for (let i = 0; i < REASON_BOXES.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const xCell = M + col * colW;
    const yCell = y + row * rowH;
    const label = REASON_BOXES[i];
    const checked = reasonChecked(data.visitReasons, label);
    drawCheckbox(doc, xCell, yCell - 3, boxSize, checked);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(label, xCell + boxSize + 3, yCell);
  }
  y += rowH * 4 + 2;

  // "Others: (Please specify below)" + lines
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Others:", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("(Please specify below)", M + 16, y);
  y += 4;
  doc.setLineWidth(0.4);
  doc.setDrawColor(40);
  for (let i = 0; i < 3; i++) {
    const lineY = y + 6 + i * 6;
    doc.line(M, lineY, PAGE_W - M, lineY);
  }
  // Render the "Others" text on the first line, if any
  if (data.otherSpecify) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(data.otherSpecify, M + 1, y + 5);
  }
  y += 28;

  // Footer panel — Patient signature on left, assignment block on right.
  // Two visual columns separated by a vertical divider.
  const footerY = Math.max(y + 6, 218);
  const dividerX = PAGE_W / 2 + 4;

  // Vertical divider
  doc.setDrawColor(60);
  doc.setLineWidth(0.4);
  doc.line(dividerX, footerY, dividerX, footerY + 50);

  // Left — Patient Signature
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Patient Signature:", M, footerY + 6);
  drawSignatureLine(doc, M, footerY + 38, 70, data.patientSignatureDataUrl);

  // Right — Assigned to / Assigned by / FO
  const rightX = dividerX + 6;
  const rightW = PAGE_W - M - rightX;
  let ry = footerY + 6;
  fieldLine(doc, rightX, ry, "Assigned to", data.assignedToNames.join(", "), rightW);
  ry += 12;
  fieldLine(doc, rightX, ry, "Assigned by", data.assignedByName, rightW);
  ry += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Front Office Executive:", rightX, ry);
  ry += 12;
  drawSignatureLine(doc, rightX, ry, rightW, data.foSignatureDataUrl);
  // Print the FO name underneath the signature line
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(data.frontOfficeExecName || "", rightX, ry + 4);

  // ─────────── PAGE 2 — INFORMED CONSENT ───────────
  doc.addPage();
  drawLogo(doc, logo);
  drawTitle(doc, "INFORMED CONSENT AND CLINIC POLICIES", 22);

  // Date right-aligned
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Date:", PAGE_W - M - 38, 36);
  doc.setFont("helvetica", "normal");
  doc.line(PAGE_W - M - 28, 37, PAGE_W - M, 37);
  doc.text(data.visitDate || "", PAGE_W - M - 27, 36);

  let py = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Please read carefully and confirm:", M, py);
  py += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const consentParas = [
    "I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge. I voluntarily consent to the collection, storage, and use of my personal and health information for the purposes of appointment scheduling, clinical assessment, and the provision of healthcare services. I understand that my information will be kept confidential and handled securely in accordance with applicable privacy and data protection regulations by Team MBD.",
    "I understand that services at MBD include, but are not limited to, physiotherapy, strength & conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness. I acknowledge that outcomes may vary between individuals and that no guarantee of specific results has been promised.",
    "I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions.",
  ];

  for (const para of consentParas) {
    const lines = doc.splitTextToSize(para, CONTENT_W);
    doc.text(lines, M, py);
    py += lines.length * 4.6 + 3;
  }

  py += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Terms & Clinic Policies:", M, py);
  py += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const policyIntro =
    "I understand that packages and services have defined durations and validity periods as explained to me. I understand that in accordance with the cancellation policy:";
  const introLines = doc.splitTextToSize(policyIntro, CONTENT_W);
  doc.text(introLines, M, py);
  py += introLines.length * 4.6 + 2;

  const policyPoints = [
    "(a) Appointments must be cancelled at least 4 hours in advance.",
    "(b) For pre-noon appointments, cancellations must be informed before 08:00 PM the previous day.",
    "(c) I understand that late cancellations or no-shows may result in session deduction.",
  ];
  for (const p of policyPoints) {
    const lines = doc.splitTextToSize(p, CONTENT_W - 6);
    doc.text(lines, M + 6, py);
    py += lines.length * 4.6 + 1;
  }

  py += 4;
  // Horizontal rule above the consent checkboxes
  doc.setLineWidth(0.4);
  doc.setDrawColor(60);
  doc.line(M, py, PAGE_W - M, py);
  py += 5;

  const consentChecks = [
    "I hereby consent to being assessed and guided by MBD's team of professionals and physician-led team based on professional judgement.",
    "I have read, understood, and agree to all above terms & policies.",
  ];
  for (const c of consentChecks) {
    drawCheckbox(doc, M, py - 3, 4, true);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(c, CONTENT_W - 8);
    doc.text(lines, M + 7, py);
    py += lines.length * 4.6 + 3;
  }

  py += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Patient Name:", M, py);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.firstName} ${data.lastName}`, M + 30, py);
  py += 16;

  // Two-column signature block at the bottom
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Signature of Patient & Date:", M, py);
  doc.text("Front Office Executive:", PAGE_W / 2 + 6, py);
  py += 18;

  drawSignatureLine(doc, M, py, 70, data.patientSignatureDataUrl);
  drawSignatureLine(doc, PAGE_W / 2 + 6, py, 70, data.foSignatureDataUrl);

  // FO name + date under the signatures
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${data.visitDate || ""}`, M, py + 5);
  doc.text(data.frontOfficeExecName || "", PAGE_W / 2 + 6, py + 5);

  return doc.output("dataurlstring");
}
