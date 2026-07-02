// One-off patch — pull the lower consent-section signatures up under
// their "Patient Signature:" / "Front Office Executive:" labels by
// removing the empty spacer paragraph + the leading <w:br/> in front of
// the signatures. Without this, the signatures float free in their own
// paragraph block and Word page-breaks them away from the labels.
//
// Idempotent — checks for the markers we're removing before touching.
//
// Run via: npx tsx scripts/fix-consent-signature-position.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATE = path.join(process.cwd(), "templates", "COMMON_PATIENT_INTAKE_FORM.docx");

// The empty spacer paragraph sits between the labels paragraph and the
// signatures paragraph. paraId "08063CA2" is the one created by Word for
// the visual breathing-room line — but combined with paragraph spacing +
// the leading <w:br/> in the signatures paragraph below it, that produces
// 2-3 blank lines of gap.
const SPACER_PARAGRAPH_NEEDLE =
  '<w:p w14:paraId="08063CA2" w14:textId="77777777" w:rsidR="000C0466" w:rsidRDefault="000C0466" w:rsidP="000C0466"><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr></w:pPr></w:p>';

// The leading <w:br/> just before {{%patientSignature}} forces another
// blank line inside the signatures paragraph. Drop it so the signature
// images sit on the first line of their paragraph (which already starts
// directly below the labels paragraph).
const LEADING_BR_NEEDLE =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:br/><w:t>{{%patientSignature}}</w:t>';
const LEADING_BR_REPLACEMENT =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>{{%patientSignature}}</w:t>';

async function main() {
  const buf = await fs.readFile(TEMPLATE);
  const zip = new PizZip(buf);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("word/document.xml missing");
  let xml = docFile.asText();

  let changed = false;

  if (xml.includes(SPACER_PARAGRAPH_NEEDLE)) {
    xml = xml.replace(SPACER_PARAGRAPH_NEEDLE, "");
    changed = true;
    console.log("Removed spacer paragraph (paraId=08063CA2).");
  } else {
    console.log("Spacer paragraph already gone — skipping.");
  }

  if (xml.includes(LEADING_BR_NEEDLE)) {
    xml = xml.replace(LEADING_BR_NEEDLE, LEADING_BR_REPLACEMENT);
    changed = true;
    console.log("Removed leading <w:br/> before {{%patientSignature}}.");
  } else {
    console.log("Leading <w:br/> already gone — skipping.");
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
