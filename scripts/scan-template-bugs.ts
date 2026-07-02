// Scan every .docx template for the three structural bugs we identified in
// PHYSIOTHERAPY_FOLLOW_UP.docx, so we know exactly which templates need
// patching and how.
//
//   1. Hard-coded "Dr." run immediately preceding a {{therapist.name}} or
//      {{consultant.name}} placeholder. Because Staff.name already includes
//      the "Dr." prefix in seed data + production, the rendered output ends
//      up "Dr. Dr. <Name>".
//
//   2. Hard-coded empty Wingdings checkbox (Wingdings char F06F = ☐)
//      placed directly before a placeholder that itself resolves to ☐/☑.
//      Result on render: "☐ ☑ DM" or "☐ ☐ CAD".
//
//   3. Duplicated {{vitals.bp}}_{{vitals.bp}} pattern (leftover from a
//      supine/standing paper-form layout that was never split into two
//      independent fields).
//
// This script ONLY reports — it does not modify any file. Run before
// scripts/fix-all-template-bugs.ts so we can confirm scope.

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

// Match a docxtemplater placeholder ({{...}}) but allow whitespace prefixes
// and `%`/`#`/`/` modifiers (image, section, end).
const PLACEHOLDER = /\{\{[%#/]?\s*[\w.]+\s*\}\}/;

interface Finding {
  template: string;
  drCount: number;
  doubleCheckboxCount: number;
  bpDupCount: number;
}

function countDrBeforeTherapistName(xml: string): number {
  // Look for "<w:t>Dr.</w:t></w:r>" followed (within a few runs) by a run
  // containing {{therapist.name}} or {{consultant.name}} or {{primaryConsultant.name}}.
  let count = 0;
  let pos = 0;
  while (true) {
    const i = xml.indexOf("<w:t>Dr.</w:t>", pos);
    if (i < 0) break;
    // Look ahead up to ~600 chars to see if a therapist/consultant placeholder follows
    const window = xml.slice(i, i + 600);
    if (
      /\{\{\s*(therapist|consultant|primaryConsultant)\.name\s*\}\}/.test(window)
    ) {
      count++;
    }
    pos = i + 14;
  }
  return count;
}

function countEmptyCheckboxes(xml: string): number {
  // Look for empty-checkbox Wingdings symbol runs (char F06F). Count only
  // those whose next sibling text run STARTS with a placeholder — those are
  // the "hardcoded box before a code-driven box" instances. Lone F06Fs that
  // exist as part of static prose (rare) get skipped.
  const symRegex = /<w:sym\s+w:font="Wingdings"\s+w:char="F06F"\s*\/>/g;
  const matches = [...xml.matchAll(symRegex)];
  let count = 0;
  for (const m of matches) {
    const after = xml.slice(m.index! + m[0].length, m.index! + m[0].length + 800);
    // The next <w:t>...</w:t> in the rendered run sequence — does it start
    // (after trim) with a placeholder?
    const tMatch = after.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
    if (tMatch && /^\s*\{\{[%#/]?\s*[\w.]+\s*\}\}/.test(tMatch[1])) {
      count++;
    }
  }
  return count;
}

function countBpDuplicates(xml: string): number {
  // Pattern: {{vitals.bp}} ... underscore-or-slash ... {{vitals.bp}} within
  // the same paragraph-ish window (< 400 chars). The legacy form sometimes
  // separated them with "_" or just whitespace.
  const text = xml;
  let count = 0;
  let pos = 0;
  const needle = "{{vitals.bp}}";
  while (true) {
    const i = text.indexOf(needle, pos);
    if (i < 0) break;
    const after = text.slice(i + needle.length, i + needle.length + 400);
    if (after.includes("{{vitals.bp}}")) {
      count++;
    }
    pos = i + needle.length;
  }
  return count;
}

async function scanOne(file: string): Promise<Finding> {
  const buf = await fs.readFile(file);
  const zip = new PizZip(buf);
  const xml = zip.file("word/document.xml")!.asText();
  return {
    template: path.basename(file),
    drCount: countDrBeforeTherapistName(xml),
    doubleCheckboxCount: countEmptyCheckboxes(xml),
    bpDupCount: countBpDuplicates(xml),
  };
}

async function main() {
  const entries = await fs.readdir(TEMPLATES_DIR);
  const docx = entries.filter((e) => e.toLowerCase().endsWith(".docx") && !e.startsWith("~$"));
  const findings: Finding[] = [];
  for (const name of docx) {
    findings.push(await scanOne(path.join(TEMPLATES_DIR, name)));
  }
  // Print as a table
  const rows = findings.map((f) => ({
    template: f.template.padEnd(40),
    Dr: String(f.drCount).padStart(2),
    "☐+placeholder": String(f.doubleCheckboxCount).padStart(3),
    "BP×2": String(f.bpDupCount).padStart(2),
    needsFix: f.drCount + f.doubleCheckboxCount + f.bpDupCount > 0 ? "YES" : "—",
  }));
  console.log("Template                                 Dr  ☐+ph  BP×2  needsFix");
  console.log("─".repeat(80));
  for (const r of rows) {
    console.log(`${r.template} ${r.Dr}   ${r["☐+placeholder"]}   ${r["BP×2"]}    ${r.needsFix}`);
  }
  const totalsAffected = findings.filter((f) => f.drCount + f.doubleCheckboxCount + f.bpDupCount > 0).length;
  console.log("");
  console.log(`${totalsAffected} of ${findings.length} templates have at least one issue.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
