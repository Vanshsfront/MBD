// One-off patch for COMMON_PATIENT_INTAKE_FORM.docx — add a 2nd
// {{%frontOffice.signature}} placeholder in the consent section so the
// rendered consent has signature pairs (patient + FO) at both the
// upper "Assigned by/to" block AND the lower "Patient consent" block.
//
// The original template ships with 2x patientSignature + 1x
// frontOffice.signature (paper original assumed a single FO countersign).
// docxtemplater substitutes every occurrence of {{%name}}; adding a 2nd
// placeholder is enough — the consent-render route already supplies the
// FO data URL.
//
// Idempotent — second run is a no-op (looks for the already-patched marker).
//
// Run via: npx tsx scripts/add-second-fo-signature.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATE = path.join(process.cwd(), "templates", "COMMON_PATIENT_INTAKE_FORM.docx");

// In the 2nd consent block the document has:
//   <w:tab/><w:t>{{frontOffice.name}}</w:t>
// We want:
//   <w:tab/><w:t>{{%frontOffice.signature}}</w:t></w:r><w:r ...><w:rPr>...</w:rPr><w:br/><w:t>{{frontOffice.name}}</w:t>
// Simplest tweak that keeps both signature image AND printed name visible:
// prepend {{%frontOffice.signature}} + a line break in the same run.
// Approach: do a literal string substitution on the run text.
//
// The pattern in the docx XML is reliably:
//   <w:tab/><w:t>{{frontOffice.name}}</w:t>
// Replacing it with:
//   <w:tab/><w:t>{{%frontOffice.signature}}</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">  {{frontOffice.name}}</w:t>
// closes the current run, opens a new one with a line break, and prints
// the name on its own line — keeping both visible.

const NEEDLE = `<w:tab/><w:t>{{frontOffice.name}}</w:t>`;
const ALREADY_PATCHED = `{{%frontOffice.signature}}</w:t></w:r><w:r><w:br/>`;
const REPLACEMENT =
  `<w:tab/><w:t>{{%frontOffice.signature}}</w:t></w:r>` +
  `<w:r><w:br/><w:t xml:space="preserve">  {{frontOffice.name}}</w:t>`;

async function main() {
  const buf = await fs.readFile(TEMPLATE);
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("word/document.xml missing — file isn't a Word docx?");
  }
  let xml = docFile.asText();

  if (xml.includes(ALREADY_PATCHED)) {
    console.log("Already patched — no changes made.");
    return;
  }

  if (!xml.includes(NEEDLE)) {
    throw new Error(
      `Could not find the consent-block FO-name run. Has the template been edited manually? ` +
        `Expected to find: ${NEEDLE}`,
    );
  }

  // Replace exactly once. If somehow the needle appears twice, narrow first.
  const firstIdx = xml.indexOf(NEEDLE);
  xml = xml.slice(0, firstIdx) + REPLACEMENT + xml.slice(firstIdx + NEEDLE.length);

  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "nodebuffer" });
  await fs.writeFile(TEMPLATE, out);
  console.log(`Patched ${path.basename(TEMPLATE)} — added 2nd {{%frontOffice.signature}} placeholder.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
