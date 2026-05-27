import jsPDF from "jspdf";

// ── Shared PDF helpers used by all template generators ──

export function drawCheckmark(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.45);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.line(x + size * 0.18, y + size * 0.52, x + size * 0.42, y + size * 0.78);
  doc.line(x + size * 0.42, y + size * 0.78, x + size * 0.88, y + size * 0.20);
  doc.setLineWidth(0.3);
}

export function checkbox(doc: jsPDF, x: number, y: number, checked: boolean, label: string) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(x, y - 3, 3.5, 3.5);
  if (checked) drawCheckmark(doc, x, y - 3, 3.5);
  doc.text(label, x + 5, y);
}

export function sectionHeader(doc: jsPDF, y: number, title: string): number {
  doc.setFillColor(240, 245, 250);
  doc.rect(14, y - 4, 182, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(title, 16, y);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  return y + 8;
}

export function field(doc: jsPDF, x: number, y: number, label: string, value: string, labelWidth = 30) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(value || "_______________", x + labelWidth, y);
}

export function drawPainScale(doc: jsPDF, x: number, y: number, value: number | undefined, label: string) {
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(label, x, y);
  const startX = x + 28;
  const scaleWidth = 120;
  const stepWidth = scaleWidth / 10;
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.line(startX, y - 1, startX + scaleWidth, y - 1);
  for (let i = 0; i <= 10; i++) {
    const px = startX + i * stepWidth;
    doc.line(px, y - 3, px, y + 1);
    doc.setFontSize(6);
    doc.text(i.toString(), px - 1, y + 4);
  }
  if (value !== undefined && value >= 0 && value <= 10) {
    const markerX = startX + value * stepWidth;
    doc.setFillColor(0, 100, 200);
    doc.circle(markerX, y - 1, 2, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 100, 200);
    doc.text(value.toString(), markerX - 1, y - 5);
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
  }
}

export function pdfHeader(doc: jsPDF, title: string) {
  const pageWidth = 210;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pageWidth / 2, 11, { align: "center" });
  doc.setTextColor(0);
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 18, pageWidth, 1, "F");
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text("Movement By Design — Clinical Record", 14, 23);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, pageWidth - 14, 23, { align: "right" });
  doc.setTextColor(0);
}

export function pdfFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(150);
    doc.text(`Movement By Design — Confidential Clinical Record — Page ${i} of ${pageCount}`, 105, 290, { align: "center" });
    doc.setTextColor(0);
  }
}

export function checkNewPage(doc: jsPDF, y: number, threshold = 260): number {
  if (y > threshold) { doc.addPage(); pdfHeader(doc, ""); return 30; }
  return y;
}

/** Wraps text and returns new Y position */
export function wrappedText(doc: jsPDF, x: number, y: number, text: string, maxWidth = 180): number {
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(text || "(Not recorded)", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * 4 + 4;
}

export function patientInfoBlock(doc: jsPDF, y: number, data: {
  date: string; patientName: string; patientId: string; age: string; sex: string;
  dominance: string; contactNo: string; occupation?: string; address?: string;
  attendingTherapist?: string; sport?: string; email?: string; maritalStatus?: string;
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
}): number {
  const m = 14;
  field(doc, m, y, "Date", data.date, 12);
  field(doc, 80, y, "Patient ID", data.patientId, 22);
  y += 6;
  field(doc, m, y, "Patient Name", data.patientName, 28);
  y += 6;
  field(doc, m, y, "Age", data.age, 10);
  field(doc, 50, y, "Sex", data.sex, 10);
  field(doc, 85, y, "Dominance", data.dominance, 22);
  field(doc, 140, y, "Contact", data.contactNo, 16);
  y += 6;
  if (data.occupation || data.sport) {
    field(doc, m, y, "Occupation", data.occupation || "", 22);
    if (data.sport) field(doc, 100, y, "Sport", data.sport, 12);
    y += 6;
  }
  if (data.email || data.maritalStatus) {
    if (data.email) field(doc, m, y, "Email", data.email, 12);
    if (data.maritalStatus) field(doc, 100, y, "Marital Status", data.maritalStatus, 28);
    y += 6;
  }
  if (data.address) { field(doc, m, y, "Address", data.address, 16); y += 6; }
  if (data.attendingTherapist) { field(doc, m, y, "Attending Therapist", data.attendingTherapist, 36); y += 6; }
  if (data.emergencyContact?.name) {
    y += 2;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("Emergency Contact:", m, y); doc.setFont("helvetica", "normal");
    y += 5;
    field(doc, m, y, "Name", data.emergencyContact.name || "", 12);
    field(doc, 60, y, "Phone", data.emergencyContact.phone || "", 14);
    field(doc, 120, y, "Relation", data.emergencyContact.relationship || "", 18);
    y += 6;
  }
  return y + 4;
}
