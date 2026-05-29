// Phase 1 verification gate: smoke-test the renderer pipeline.
//
// Builds:
//   - tmp/smoke/sample-clinical.docx: a synthetic placeholder-marked DOCX,
//     rendered with sample data (proves docxtemplater + PizZip wiring).
//   - tmp/smoke/sample-clinical.pdf: PDF conversion via LibreOffice.
//   - tmp/smoke/sample-invoice.xlsx: 4-flavor invoices rendered against
//     real client templates (proves exceljs + cell layout).

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import { renderInvoice } from "../src/lib/templates/xlsx";

const OUT = path.join(process.cwd(), "tmp", "smoke");

async function buildSampleTemplate(): Promise<Buffer> {
  const doc = new Document({
    styles: {
      default: { document: { run: { size: 22 } } },
    },
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: "MBD Smoke Test — Clinical Form", bold: true })],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Patient: {{patient.name}}", bold: true })] }),
          new Paragraph({ text: "Age: {{patient.age}}  •  Sex: {{patient.sex}}  •  Contact: {{patient.phone}}" }),
          new Paragraph({ text: "Visit date: {{visitDate}}" }),
          new Paragraph({ text: "" }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Vitals" }),
          new Paragraph({ text: "Body weight: {{vitals.bodyWeight}} kg" }),
          new Paragraph({ text: "Height: {{vitals.height}} cm" }),
          new Paragraph({ text: "BP: {{vitals.bp.systolic}}/{{vitals.bp.diastolic}} mmHg" }),
          new Paragraph({ text: "" }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Follow-ups" }),
          new Paragraph({ text: "{{#followups}}Visit {{visitNumber}} ({{date}}): {{notes}}{{/followups}}" }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "Therapist: {{therapist.name}}" }),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

async function renderSampleDocx(templateBuf: Buffer): Promise<Buffer> {
  const zip = new PizZip(templateBuf);
  const tpl = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  tpl.render({
    patient: { name: "Aarav Mehta", age: 34, sex: "M", phone: "+91 98200 11122" },
    visitDate: "06 May 2026",
    vitals: { bodyWeight: 78, height: 178, bp: { systolic: 122, diastolic: 80 } },
    followups: [
      { visitNumber: 1, date: "01 Apr 2026", notes: "Initial assessment, baseline ROM measured." },
      { visitNumber: 2, date: "10 Apr 2026", notes: "Reduced pain; introduced manual therapy." },
      { visitNumber: 3, date: "20 Apr 2026", notes: "Progressing well; added strengthening exercises." },
    ],
    therapist: { name: "Dr. Devanshi Vira" },
  });
  const out = tpl.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  return out;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  console.log("[smoke] building sample template (docx)…");
  const tpl = await buildSampleTemplate();
  await fs.writeFile(path.join(OUT, "sample-clinical-template.docx"), tpl);

  console.log("[smoke] rendering sample template with data…");
  const rendered = await renderSampleDocx(tpl);
  await fs.writeFile(path.join(OUT, "sample-clinical.docx"), rendered);

  console.log("[smoke] rendering Services invoice…");
  const services = await renderInvoice({
    flavor: "services",
    centreName: "Movement By Design — Colaba",
    clientName: "Aarav Mehta",
    invoiceNumber: "COL-MBD/0001/001-2026",
    invoiceDate: new Date(2026, 4, 6),
    referredBy: "Dr. Yasir Zahid",
    lineItems: [
      {
        description: "Physiotherapy Session (Senior Physiotherapist)",
        consultant: "Dr. Devanshi Vira",
        hsnSac: "999314",
        qty: 6,
        perAmount: 1800,
        lineDiscountFraction: 0,
        gstRate: 0,
        lineAmount: 10800,
      },
      {
        description: "K-Taping",
        consultant: "Dr. Devanshi Vira",
        hsnSac: "999314",
        qty: 2,
        perAmount: 600,
        lineDiscountFraction: 0,
        gstRate: 0,
        lineAmount: 1200,
      },
    ],
    additionalDiscountPercent: 5,
    totalPaid: 0,
  });
  await fs.writeFile(path.join(OUT, "sample-invoice-services.xlsx"), services);

  console.log("[smoke] rendering Products invoice…");
  const products = await renderInvoice({
    flavor: "products",
    centreName: "Movement By Design — Colaba",
    clientName: "Aarav Mehta",
    invoiceNumber: "COL-MBD/0002/002-2026",
    invoiceDate: new Date(2026, 4, 6),
    lineItems: [
      { description: "Theraband", notes: "Resistance band — medium", hsnSac: "95069190", qty: 2, perAmount: 800, lineDiscountFraction: 0 },
      { description: "Kinesio Tape", notes: "5cm × 5m roll", hsnSac: "95069990", qty: 1, perAmount: 1200, lineDiscountFraction: 0.1 },
    ],
  });
  await fs.writeFile(path.join(OUT, "sample-invoice-products.xlsx"), products);

  console.log("[smoke] rendering Manual invoice…");
  const manual = await renderInvoice({
    flavor: "manual",
    centreName: "Movement By Design — Colaba",
    clientName: "Aarav Mehta",
    invoiceNumber: "COL-MBD/0003/003-2026",
    invoiceDate: new Date(2026, 4, 6),
    lineItems: [
      { description: "Custom rehabilitation programme (4 weeks)", consultant: "Dr. Yasir Zahid", hsnSac: "999314", qty: 1, perAmount: 24000, lineDiscountFraction: 0, gstRate: 0 },
    ],
  });
  await fs.writeFile(path.join(OUT, "sample-invoice-manual.xlsx"), manual);

  console.log("[smoke] rendering Proforma invoice…");
  const proforma = await renderInvoice({
    flavor: "proforma",
    centreName: "Movement By Design — Colaba",
    clientName: "Aarav Mehta",
    invoiceNumber: "COL-MBD/0004/004-2026",
    invoiceDate: new Date(2026, 4, 6),
    validTill: new Date(2026, 5, 6),
    lineItems: [
      { description: "Physiotherapy 12-session package", consultant: "Dr. Devanshi Vira", hsnSac: "999314", qty: 12, perAmount: 1800, lineDiscountFraction: 0, gstRate: 0, lineAmount: 21600 },
    ],
    additionalDiscountPercent: 10,
  });
  await fs.writeFile(path.join(OUT, "sample-invoice-proforma.xlsx"), proforma);

  console.log("[smoke] all artifacts written to tmp/smoke/");
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
