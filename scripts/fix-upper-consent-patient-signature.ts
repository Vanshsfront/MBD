// One-off patch — the upper consent-table row places {{%patientSignature}}
// in the RIGHT cell (right after "Assigned to: {{assignedTo}}"), so the
// patient's signature image renders next to the doctor list instead of
// next to the "Patient Signature:" label in the LEFT cell.
//
// Fix: drop the {{%patientSignature}} run from the right cell, and add a
// new paragraph holding it inside the left cell, directly below the label.
// vAlign=center on the cell keeps the label + signature visually grouped.
//
// Idempotent — checks for both needles before touching.
//
// Run via: npx tsx scripts/fix-upper-consent-patient-signature.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATE = path.join(process.cwd(), "templates", "COMMON_PATIENT_INTAKE_FORM.docx");

// The misplaced run inside the right cell. The rsidR="00776D36" + the
// {{%patientSignature}} text make this unique to the upper occurrence —
// the lower section uses rsidRPr="000C0466".
const RIGHT_CELL_NEEDLE =
  '<w:r w:rsidR="00776D36"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>{{%patientSignature}}</w:t></w:r>';

// The left-cell label paragraph, ending with </w:p></w:tc>. Disambiguated
// from the lower "Patient Signature:" by the </w:p></w:tc> tail — only the
// in-table occurrence is immediately followed by a cell-close.
const LEFT_CELL_NEEDLE =
  '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>Patient Signature:</w:t></w:r></w:p></w:tc>';

// Replacement: keep the label paragraph as-is, then append a sibling
// paragraph inside the same cell that holds the image placeholder.
const LEFT_CELL_REPLACEMENT =
  '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>Patient Signature:</w:t></w:r></w:p>' +
  '<w:p w14:paraId="1329D6E7" w14:textId="77777777" w:rsidR="009B5D1A" w:rsidRDefault="009B5D1A" w:rsidP="009B5D1A">' +
  '<w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr></w:pPr>' +
  '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>{{%patientSignature}}</w:t></w:r>' +
  '</w:p></w:tc>';

async function main() {
  const buf = await fs.readFile(TEMPLATE);
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing");
  let xml = docFile.asText();

  let changed = false;

  if (xml.includes(RIGHT_CELL_NEEDLE)) {
    xml = xml.replace(RIGHT_CELL_NEEDLE, "");
    changed = true;
    console.log("Removed misplaced {{%patientSignature}} from right cell.");
  } else {
    console.log("Right-cell signature run already gone — skipping.");
  }

  if (xml.includes(LEFT_CELL_NEEDLE)) {
    xml = xml.replace(LEFT_CELL_NEEDLE, LEFT_CELL_REPLACEMENT);
    changed = true;
    console.log("Added {{%patientSignature}} paragraph inside left cell.");
  } else {
    console.log("Left-cell signature paragraph already present — skipping.");
  }

  if (!changed) {
    console.log("No changes needed.");
    return;
  }

  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer" });
  await fs.writeFile(TEMPLATE, out);
  console.log(`Patched ${path.basename(TEMPLATE)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
