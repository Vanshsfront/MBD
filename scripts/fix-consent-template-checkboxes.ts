// One-time fix: the COMMON_PATIENT_INTAKE_FORM.docx still contains the
// Wingdings F0A8 ("empty box" glyph) characters left over from the original
// paper form. The placeholder injection step added {{r.{category}}}
// placeholders next to those glyphs but didn't remove them, so the rendered
// consent shows ☐ ☑ Pain/Injury — two checkboxes per line. We want just
// one (the ticked-state placeholder renders ☑ for selected, "" otherwise).
//
// This script strips the legacy <w:sym w:font="Wingdings" w:char="F0A8"/>
// elements from the document and writes the template back. Run once;
// idempotent (re-running on a fixed template is a no-op).
//
// Usage: node --import tsx scripts/fix-consent-template-checkboxes.ts

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "COMMON_PATIENT_INTAKE_FORM.docx",
);

const buf = readFileSync(TEMPLATE_PATH);
const zip = new PizZip(buf);
const documentXml = zip.file("word/document.xml")?.asText();
if (!documentXml) {
  console.error("[fix-consent-template] document.xml not in template");
  process.exit(1);
}

// Strip both the standalone sym element and the surrounding run-properties
// that often pair with it (otherwise we leave an empty <w:r> behind). We
// match the F0A8 glyph specifically — other Wingdings symbols stay.
const before = (documentXml.match(/<w:sym w:font="Wingdings" w:char="F0A8"\/>/g) || []).length;
let next = documentXml.replace(
  /<w:sym w:font="Wingdings" w:char="F0A8"\s*\/>/g,
  "",
);
// Some runs might now be empty (<w:r>...</w:r> with only rPr inside) — leave
// them alone; Word handles them fine and removing run wrappers risks
// breaking adjacent formatting.
const after = (next.match(/<w:sym w:font="Wingdings" w:char="F0A8"\/>/g) || []).length;

if (before === 0) {
  console.log("[fix-consent-template] no F0A8 Wingdings glyphs found — already fixed");
  process.exit(0);
}

zip.file("word/document.xml", next);
const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(TEMPLATE_PATH, out);
console.log(
  `[fix-consent-template] removed ${before - after} F0A8 Wingdings glyphs from ${path.basename(TEMPLATE_PATH)}`,
);
