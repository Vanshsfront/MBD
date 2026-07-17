// Change spec 08 E/F/G — consent template surgery.
//
// Rewrites templates/COMMON_PATIENT_INTAKE_FORM.docx so that:
//   E. the patient's block reads name -> signature image -> "Patient's
//      Signature" caption (it printed caption-then-image, i.e. backwards);
//   F. the Front Office executive's name prints alongside their signature in
//      BOTH places the block appears (the upper table had the signature with
//      no name at all), and the lower block stops relying on manual <w:br/>
//      runs to shove the signature onto its own line instead of letting it sit
//      under its own label;
//   G. a guardian name / relationship / signature block exists at all — those
//      fields were captured and stored but had nowhere to print.
//
// The document has two consent blocks with different structure:
//   * upper: a 4x2 table. Left column = patient signature (row1 cell0 is a
//     vMerge restart spanning rows 1-3); right column = assignment + FO.
//   * lower: free-flowing paragraphs aligned with runs of <w:tab/>.
// They're edited separately, split on the table's end offset, because the same
// literal text ("Patient Signature:") appears in both and a global replace
// would hit the wrong one.
//
// The lower block gets an explicit tab stop rather than counted tabs: the
// patient signature image is ~180px wide and eats several default half-inch
// stops, so a fixed number of tabs lands the right-hand column in a different
// place on every line. One stop at 5040 twips (3.5") is deterministic.
//
// Idempotent: re-running detects the applied marker and no-ops.
//
// Run: node --import tsx scripts/fix-consent-template-signature-blocks.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATE = path.join(process.cwd(), "templates", "COMMON_PATIENT_INTAKE_FORM.docx");

/** The run properties every paragraph in these blocks already uses. */
const RPR =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr>';
const SPACING = '<w:spacing w:after="0" w:line="360" w:lineRule="auto"/>';
/** Single left tab stop at 3.5" — the lower block's right-hand column. */
const TAB_STOP = '<w:tabs><w:tab w:val="left" w:pos="5040"/></w:tabs>';

/** A bold Times paragraph carrying `text` (which may contain template tags). */
function para(text: string): string {
  return `<w:p><w:pPr>${RPR}</w:pPr><w:r>${RPR}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/** A two-column line in the lower block: `left`, tab to 3.5", then `right`. */
function columns(left: string, right: string): string {
  return (
    `<w:p><w:pPr>${SPACING}${TAB_STOP}${RPR}</w:pPr>` +
    `<w:r>${RPR}<w:t xml:space="preserve">${left}</w:t></w:r>` +
    `<w:r>${RPR}<w:tab/></w:r>` +
    `<w:r>${RPR}<w:t xml:space="preserve">${right}</w:t></w:r>` +
    `</w:p>`
  );
}

function must(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Replaces the sole occurrence of `find`, asserting it is present and unique. */
function replaceOnce(xml: string, find: string, replaceWith: string, label: string): string {
  const idx = xml.indexOf(find);
  must(idx !== -1, `anchor not found: ${label}`);
  must(
    xml.indexOf(find, idx + find.length) === -1,
    `anchor matches more than once: ${label}`,
  );
  return xml.slice(0, idx) + replaceWith + xml.slice(idx + find.length);
}

async function main(): Promise<void> {
  const zip = new PizZip(await fs.readFile(TEMPLATE));
  const original = zip.file("word/document.xml")!.asText();

  if (original.includes("{{#guardian.show}}")) {
    console.log("[consent-template] already patched — nothing to do");
    return;
  }

  // Split on the consent table so each block's edits can use simple anchors.
  const tableEnd = original.indexOf("</w:tbl>", original.indexOf("{{%patientSignature}}"));
  must(tableEnd !== -1, "could not locate the end of the upper consent table");
  let head = original.slice(0, tableEnd);
  let tail = original.slice(tableEnd);

  // ── Upper block (table) ────────────────────────────────────────────────
  // E: the caption sat in row0, above the image. Put the patient's name there
  // instead, and move the caption below the image inside the merged cell, so
  // the column reads name -> image -> caption.
  head = replaceOnce(
    head,
    "<w:t>Patient Signature:</w:t>",
    '<w:t xml:space="preserve">{{patient.name}}</w:t>',
    "upper: patient signature caption -> patient name",
  );
  head = replaceOnce(
    head,
    "<w:t>{{%patientSignature}}</w:t></w:r></w:p>",
    `<w:t>{{%patientSignature}}</w:t></w:r></w:p>${para("Patient's Signature")}`,
    "upper: caption below patient signature",
  );

  // F: this block printed the FO signature with no name next to it at all.
  // The name goes under the signature, sharing the label's indent.
  head = replaceOnce(
    head,
    "<w:t>{{%frontOffice.signature}}</w:t></w:r></w:p>",
    `<w:t>{{%frontOffice.signature}}</w:t></w:r></w:p>${para("     {{frontOffice.name}}")}`,
    "upper: FO name under FO signature",
  );

  // ── Lower block (tab-aligned paragraphs) ───────────────────────────────
  // Replace the label row + signature row wholesale. The originals are two
  // consecutive paragraphs; matching each in full keeps this unambiguous.
  const labelRow = tail.match(
    /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:t>Patient Signature:<\/w:t>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/,
  );
  must(labelRow !== null, "lower: label row not found");
  const signatureRow = tail.match(
    /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?\{\{%patientSignature\}\}(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/,
  );
  must(signatureRow !== null, "lower: signature row not found");
  must(
    tail.indexOf(signatureRow[0]) === tail.indexOf(labelRow[0]) + labelRow[0].length,
    "lower: expected the signature row to directly follow the label row",
  );

  const rebuiltLower =
    // Patient's caption moves below the image, so the label row keeps only the
    // FO label — which now sits directly above the FO signature.
    columns("", "Front Office Executive:") +
    columns("{{%patientSignature}}", "{{%frontOffice.signature}}") +
    columns("Patient's Signature", "{{frontOffice.name}}") +
    // G: guardian block, wrapped in a conditional section so it's removed
    // outright for an adult. Rendering the fields empty isn't enough — blank
    // paragraphs still occupy space and pushed a near-empty third page onto
    // every adult's consent form (the template is 2 pages).
    para("{{#guardian.show}}") +
    para("{{guardian.acknowledgement}}") +
    para("{{guardian.nameLine}}") +
    para("{{%guardianSignature}}") +
    para("Guardian's Signature") +
    para("{{/guardian.show}}");

  tail = replaceOnce(
    tail,
    labelRow[0] + signatureRow[0],
    rebuiltLower,
    "lower: rebuild signature rows + guardian block",
  );

  zip.file("word/document.xml", head + tail);
  await fs.writeFile(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("[consent-template] patched COMMON_PATIENT_INTAKE_FORM.docx");
}

main().catch((err) => {
  console.error("[consent-template] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
