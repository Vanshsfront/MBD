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
import assert from "node:assert/strict";
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
import ExcelJS from "exceljs";

import { renderInvoice } from "../src/lib/templates/xlsx";
import { amountInWordsInr } from "../src/lib/revenue/amount-in-words";

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

async function sheetFromFile(filename: string): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("rendered invoice has no worksheet");
  return sheet;
}

function textCell(sheet: ExcelJS.Worksheet, address: string): string {
  const value = sheet.getCell(address).value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text).join("");
    }
    if ("result" in value) return String(value.result ?? "");
  }
  return String(value);
}

function assertTextCell(
  sheet: ExcelJS.Worksheet,
  address: string,
  expected: string,
): void {
  assert.equal(textCell(sheet, address).trim(), expected);
}

function assertNumberCell(
  sheet: ExcelJS.Worksheet,
  address: string,
  expected: number,
): void {
  assert.equal(sheet.getCell(address).value, expected);
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
    centreAddress: "B 5, Ionic building, Justice Vyas Marg, Mumbai, Maharashtra, 400005",
    clientName: "Aarav Mehta",
    clientAddress: "Test address, Mumbai, Maharashtra, 400001",
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
    totalGst: 1026,
    cgstAmount: 513,
    sgstAmount: 513,
    igstAmount: 0,
    totalAmount: 12426,
    amountInWords: amountInWordsInr(12426),
    paidBy: "UPI",
    txnId: "SMOKE-SVC-001",
  });
  const servicesPath = path.join(OUT, "sample-invoice-services.xlsx");
  await fs.writeFile(servicesPath, services);
  const servicesSheet = await sheetFromFile(servicesPath);
  assertTextCell(servicesSheet, "H15", "Invoice No.");
  assertTextCell(servicesSheet, "H16", "Invoice Date");
  assertTextCell(servicesSheet, "J15", "COL-MBD/0001/001-2026");
  assertTextCell(servicesSheet, "J16", "06-May-2026");
  assertTextCell(servicesSheet, "B16", "Movement By Design — Colaba");
  assertTextCell(servicesSheet, "D16", "Aarav Mehta");
  assertNumberCell(servicesSheet, "H55", 0.05);
  assertTextCell(servicesSheet, "J24", "CGST INR 513.00 | SGST INR 513.00");
  assertTextCell(servicesSheet, "C61", amountInWordsInr(12426));
  assertTextCell(servicesSheet, "C64", "UPI");
  assertTextCell(servicesSheet, "B60", "TXN ID     : SMOKE-SVC-001");

  console.log("[smoke] rendering Products invoice…");
  const products = await renderInvoice({
    flavor: "products",
    centreName: "Movement By Design — Colaba",
    centreAddress: "B 5, Ionic building, Justice Vyas Marg, Mumbai, Maharashtra, 400005",
    clientName: "Aarav Mehta",
    clientAddress: "Test address, Mumbai, Maharashtra, 400001",
    invoiceNumber: "COL-MBD/0002/002-2026",
    invoiceDate: new Date(2026, 4, 6),
    lineItems: [
      { description: "Theraband", notes: "Resistance band — medium", hsnSac: "95069190", qty: 2, perAmount: 800, lineDiscountFraction: 0 },
      { description: "Kinesio Tape", notes: "5cm × 5m roll", hsnSac: "95069990", qty: 1, perAmount: 1200, lineDiscountFraction: 0.1 },
    ],
    totalGst: 482.4,
    igstAmount: 482.4,
    totalAmount: 3162.4,
    amountInWords: amountInWordsInr(3162.4),
    paidBy: "Card",
    txnId: "SMOKE-PROD-001",
  });
  const productsPath = path.join(OUT, "sample-invoice-products.xlsx");
  await fs.writeFile(productsPath, products);
  const productsSheet = await sheetFromFile(productsPath);
  assertTextCell(productsSheet, "H15", "Invoice No.");
  assertTextCell(productsSheet, "J15", "COL-MBD/0002/002-2026");
  assertTextCell(productsSheet, "J24", "IGST INR 482.40");
  assertNumberCell(productsSheet, "H29", 0.1);
  assertTextCell(productsSheet, "C55", amountInWordsInr(3162.4));
  assertTextCell(productsSheet, "C58", "Card");
  assertTextCell(productsSheet, "C60", "SMOKE-PROD-001");

  console.log("[smoke] rendering Manual invoice…");
  const manual = await renderInvoice({
    flavor: "manual",
    centreName: "Movement By Design — Colaba",
    centreAddress: "B 5, Ionic building, Justice Vyas Marg, Mumbai, Maharashtra, 400005",
    clientName: "Aarav Mehta",
    clientAddress: "Test address, Mumbai, Maharashtra, 400001",
    invoiceNumber: "COL-MBD/0003/003-2026",
    invoiceDate: new Date(2026, 4, 6),
    lineItems: [
      { description: "Custom rehabilitation programme (4 weeks)", consultant: "Dr. Yasir Zahid", hsnSac: "999314", qty: 1, perAmount: 24000, lineDiscountFraction: 0, gstRate: 0 },
    ],
    totalGst: 4320,
    cgstAmount: 2160,
    sgstAmount: 2160,
    totalAmount: 28320,
    amountInWords: amountInWordsInr(28320),
    paidBy: "Cash",
  });
  const manualPath = path.join(OUT, "sample-invoice-manual.xlsx");
  await fs.writeFile(manualPath, manual);
  const manualSheet = await sheetFromFile(manualPath);
  assertTextCell(manualSheet, "H15", "Invoice No.");
  assertTextCell(manualSheet, "J15", "COL-MBD/0003/003-2026");
  assertTextCell(manualSheet, "J24", "CGST INR 2160.00 | SGST INR 2160.00");
  assertTextCell(manualSheet, "C57", amountInWordsInr(28320));
  assertTextCell(manualSheet, "C60", "Cash");

  console.log("[smoke] rendering Proforma invoice…");
  const proforma = await renderInvoice({
    flavor: "proforma",
    centreName: "Movement By Design — Colaba",
    centreAddress: "B 5, Ionic building, Justice Vyas Marg, Mumbai, Maharashtra, 400005",
    clientName: "Aarav Mehta",
    clientAddress: "Test address, Mumbai, Maharashtra, 400001",
    invoiceNumber: "COL-MBD/0004/004-2026",
    invoiceDate: new Date(2026, 4, 6),
    validTill: new Date(2026, 5, 6),
    lineItems: [
      { description: "Physiotherapy 12-session package", consultant: "Dr. Devanshi Vira", hsnSac: "999314", qty: 12, perAmount: 1800, lineDiscountFraction: 0, gstRate: 0, lineAmount: 21600 },
    ],
    additionalDiscountPercent: 10,
    totalGst: 3499.2,
    igstAmount: 3499.2,
    totalAmount: 22939.2,
    amountInWords: amountInWordsInr(22939.2),
  });
  const proformaPath = path.join(OUT, "sample-invoice-proforma.xlsx");
  await fs.writeFile(proformaPath, proforma);
  const proformaSheet = await sheetFromFile(proformaPath);
  assertTextCell(proformaSheet, "H15", "Invoice No.");
  assertTextCell(proformaSheet, "J15", "COL-MBD/0004/004-2026");
  assertTextCell(proformaSheet, "J24", "IGST INR 3499.20");
  assertTextCell(proformaSheet, "C57", amountInWordsInr(22939.2));

  await assertTablePartsIntact([
    ["services", servicesPath, "Invoice_Services.xlsx"],
    ["products", productsPath, "Invoice_Products.xlsx"],
    ["manual", manualPath, "Invoice_Manual.xlsx"],
    ["proforma", proformaPath, "Invoice_Proforma.xlsx"],
  ]);

  console.log("[smoke] all artifacts written to tmp/smoke/ and invoice cells verified");
}

/**
 * Guards the fix for Excel's "we found a problem with some content" repair
 * prompt. ExcelJS rewrites the templates' embedded lookup table with
 * headerRowCount="0" + totalsRowShown="1" while keeping a header-spanning ref
 * and an autoFilter — a contradiction Excel offers to repair. renderInvoice
 * copies the template's table parts back in verbatim; this asserts it stuck.
 *
 * Byte-identical is the right bar: we never touch the MasterData sheet the
 * table lives on, so any difference at all means the round-trip damaged it.
 */
async function assertTablePartsIntact(
  cases: Array<[flavor: string, renderedPath: string, templateName: string]>,
): Promise<void> {
  for (const [flavor, renderedPath, templateName] of cases) {
    const templateZip = new PizZip(
      await fs.readFile(path.join(process.cwd(), "templates", templateName)),
    );
    const renderedZip = new PizZip(await fs.readFile(renderedPath));
    const tableParts = Object.keys(templateZip.files).filter((n) =>
      /^xl\/tables\/.*\.xml$/.test(n),
    );
    assert.ok(tableParts.length > 0, `${templateName} should carry a table part`);

    for (const part of tableParts) {
      const expected = templateZip.file(part)!.asText();
      const actualFile = renderedZip.file(part);
      assert.ok(actualFile, `${flavor}: ${part} missing from rendered invoice`);
      assert.equal(
        actualFile.asText(),
        expected,
        `${flavor}: ${part} differs from the template — Excel will prompt to repair`,
      );
    }
    console.log(`[smoke] ${flavor}: ${tableParts.length} table part(s) intact`);
  }
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
