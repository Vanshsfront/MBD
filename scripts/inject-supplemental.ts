// Guarded supplemental placeholder injection.
//
// The original scripts/inject-placeholders.ts is NOT idempotent for narrative
// rules (e.g. "Chief Complaints:" re-fires inside the already-injected
// "Chief Complaints: {{chiefComplaints}}" and doubles it). This pass adds
// placeholders the shipped templates are missing WITHOUT that risk: each rule
// is skipped if its placeholder is already present, and it inserts the
// placeholder immediately after a specific label anchor (first occurrence).
//
// Run: node --env-file=.env --import tsx scripts/inject-supplemental.ts
// Idempotent: re-running is a no-op once the placeholders are present.

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

interface Rule {
  anchor: string; // exact text as it appears in document.xml (entities like &amp; included)
  placeholder: string; // inserted right after the anchor, inside the same run
}

const TARGETS: { file: string; rules: Rule[] }[] = [
  {
    file: "PHYSIOTHERAPY_CONSULTATION.docx",
    rules: [
      // Clinician signature image at the bottom signature line.
      { anchor: "Signature of Physiotherapist &amp; Date:", placeholder: "{{%consultantSignature}}" },
    ],
  },
  {
    file: "PHYSICIAN_CONSULTATION.docx",
    rules: [
      // Plan of care narrative (label currently runs straight into "Follow up:").
      { anchor: "Plan of Care &amp; Advice:", placeholder: "{{planOfCare}}" },
    ],
  },
];

async function run() {
  const root = path.join(process.cwd(), "templates");
  for (const t of TARGETS) {
    const full = path.join(root, t.file);
    const zip = new PizZip(await fs.readFile(full));
    let xml = zip.file("word/document.xml")!.asText();
    let changed = 0;
    console.log(`\n${t.file}`);
    for (const r of t.rules) {
      if (xml.includes(r.placeholder)) {
        console.log(`  skip (already present): ${r.placeholder}`);
        continue;
      }
      const idx = xml.indexOf(r.anchor);
      if (idx < 0) {
        console.log(`  WARN anchor not found (skipped): "${r.anchor}"`);
        continue;
      }
      const at = idx + r.anchor.length;
      xml = `${xml.slice(0, at)} ${r.placeholder}${xml.slice(at)}`;
      changed++;
      console.log(`  injected ${r.placeholder}`);
    }
    if (changed > 0) {
      zip.file("word/document.xml", xml);
      await fs.writeFile(full, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
    }
    console.log(`  → ${changed} change(s)`);
  }
}

run();
