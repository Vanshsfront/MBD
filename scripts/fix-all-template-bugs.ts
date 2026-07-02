// Generalized fixer for the three structural bugs we identified across the
// clinical templates. Replaces the template-specific one-off scripts.
//
//   1. Hard-coded "Dr." run preceding {{therapist.name}} / {{consultant.name}}.
//   2. Hard-coded Wingdings empty checkbox (F06F) preceding a placeholder.
//   3. Duplicated {{vitals.bp}} with an underscore separator.
//
// Works by reasoning about runs rather than literal strings — the same bug
// shows up with different rsid attributes across templates, so we can't
// reuse the exact needles from fix-physio-followup-template.ts.
//
// Idempotent — re-running this on already-patched templates is a no-op.
//
// Run via: npx tsx scripts/fix-all-template-bugs.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

// Match a single complete <w:r ...>...</w:r> element. Runs don't nest in
// OOXML so a single non-greedy match is correct and unambiguous.
const RUN_RE = /<w:r\b[^>]*>(?:(?!<w:r\b)[\s\S])*?<\/w:r>/g;

// Extract the contents of any <w:t...>...</w:t> tags in a run, concatenated.
function runText(run: string): string {
  const parts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  for (const m of run.matchAll(re)) parts.push(m[1]);
  return parts.join("");
}

// True if the run is a "symbol-only" run holding the Wingdings empty
// checkbox (F06F) and nothing else (no <w:t>).
function isEmptyCheckboxRun(run: string): boolean {
  if (!/<w:sym\s+w:font="Wingdings"\s+w:char="F06F"\s*\/>/.test(run)) return false;
  // No actual text content — symbol-only.
  return !/<w:t[^>]*>/.test(run);
}

// True if the run's text content is just "Dr." (after trim).
function isJustDrRun(run: string): boolean {
  return runText(run).trim() === "Dr.";
}

// True if the run's text content starts with a docxtemplater placeholder.
function startsWithPlaceholder(run: string): boolean {
  return /^\s*\{\{[%#/]?\s*[\w.]+\s*\}\}/.test(runText(run));
}

// True if the run's text content references a "therapist", "consultant",
// or "primaryConsultant" .name field.
function referencesTherapistName(run: string): boolean {
  return /\{\{\s*(therapist|consultant|primaryConsultant)\.name\s*\}\}/.test(
    runText(run),
  );
}

// True if the run's text content is just "_" (the legacy BP separator).
function isJustUnderscoreRun(run: string): boolean {
  return runText(run).trim() === "_";
}

// Does this run contain the {{vitals.bp}} placeholder?
function containsBpPlaceholder(run: string): boolean {
  return runText(run).includes("{{vitals.bp}}");
}

interface FixCounts {
  dr: number;
  checkbox: number;
  bp: number;
}

function fixXml(xml: string): { xml: string; counts: FixCounts } {
  // Collect all runs with their byte positions in one pass. We then iterate
  // backwards so byte indices stay stable as we splice out content.
  const runs: { start: number; end: number; body: string }[] = [];
  for (const m of xml.matchAll(RUN_RE)) {
    runs.push({ start: m.index!, end: m.index! + m[0].length, body: m[0] });
  }

  const drops = new Set<number>(); // indices into `runs` to delete
  const replacements = new Map<number, string>(); // index → replacement body
  const counts: FixCounts = { dr: 0, checkbox: 0, bp: 0 };

  // --- 1. Hard-coded "Dr." preceding a therapist/consultant name placeholder.
  //     Walk forward a small window of runs and check for the name reference.
  for (let i = 0; i < runs.length; i++) {
    if (!isJustDrRun(runs[i]!.body)) continue;
    for (let j = i + 1; j < Math.min(runs.length, i + 8); j++) {
      if (drops.has(j)) continue;
      if (referencesTherapistName(runs[j]!.body)) {
        drops.add(i);
        counts.dr++;
        break;
      }
    }
  }

  // --- 2. Empty-checkbox symbol run directly before a run that starts with
  //     a placeholder. Drop the symbol run; the placeholder itself resolves
  //     to ☐ or ☑.
  for (let i = 0; i < runs.length - 1; i++) {
    if (!isEmptyCheckboxRun(runs[i]!.body)) continue;
    // Find next "text-bearing" run (skip drops + symbol-only runs).
    let j = i + 1;
    while (j < runs.length && (drops.has(j) || isEmptyCheckboxRun(runs[j]!.body))) j++;
    if (j >= runs.length) continue;
    if (startsWithPlaceholder(runs[j]!.body)) {
      drops.add(i);
      counts.checkbox++;
    }
  }

  // --- 3. {{vitals.bp}} duplicated with an underscore separator. Pattern:
  //          [run with BP] [optional underscore-only run] [run with BP].
  //     For each subsequent BP-containing run we find within a small window
  //     of a prior BP run, drop the second BP run + any underscore-only
  //     runs between them. Also rewrite the first BP run's text so it has
  //     a trailing space (otherwise it'd collide with " mmHg").
  for (let i = 0; i < runs.length; i++) {
    if (drops.has(i) || !containsBpPlaceholder(runs[i]!.body)) continue;
    // Look ahead up to 6 runs for a sibling BP run.
    for (let j = i + 1; j < Math.min(runs.length, i + 7); j++) {
      if (drops.has(j)) continue;
      // Tolerate underscore-only and symbol-only runs in between.
      if (isJustUnderscoreRun(runs[j]!.body) || isEmptyCheckboxRun(runs[j]!.body)) continue;
      if (containsBpPlaceholder(runs[j]!.body)) {
        // Drop every run between i and j (inclusive of j) that is either
        // the duplicate BP itself or a pure-underscore separator.
        for (let k = i + 1; k <= j; k++) {
          if (
            containsBpPlaceholder(runs[k]!.body) ||
            isJustUnderscoreRun(runs[k]!.body)
          ) {
            drops.add(k);
          }
        }
        // Ensure the surviving first BP run renders with a trailing space.
        const survivor = runs[i]!.body;
        const rewritten = survivor.replace(
          /<w:t([^>]*)>([^<]*\{\{vitals\.bp\}\})<\/w:t>/,
          (_full, attrs, text) => {
            const hasPreserve = / xml:space="preserve"/.test(attrs);
            const tWithSpace = text.endsWith(" ") ? text : `${text} `;
            const newAttrs = hasPreserve ? attrs : `${attrs} xml:space="preserve"`;
            return `<w:t${newAttrs}>${tWithSpace}</w:t>`;
          },
        );
        if (rewritten !== survivor) replacements.set(i, rewritten);
        counts.bp++;
        break; // only fix the first pairing — re-running handles further dupes
      }
      // Hit a non-BP, non-underscore run — stop looking for a pair.
      break;
    }
  }

  if (drops.size === 0 && replacements.size === 0) return { xml, counts };

  // Apply edits back-to-front so positions stay stable.
  let out = xml;
  const indices = [...new Set([...drops, ...replacements.keys()])].sort((a, b) => b - a);
  for (const idx of indices) {
    const r = runs[idx]!;
    if (drops.has(idx)) {
      out = out.slice(0, r.start) + out.slice(r.end);
    } else {
      const rep = replacements.get(idx)!;
      out = out.slice(0, r.start) + rep + out.slice(r.end);
    }
  }
  return { xml: out, counts };
}

async function main() {
  const entries = await fs.readdir(TEMPLATES_DIR);
  const docx = entries.filter(
    (e) => e.toLowerCase().endsWith(".docx") && !e.startsWith("~$"),
  );

  let totalDr = 0,
    totalCheckbox = 0,
    totalBp = 0,
    touched = 0;

  for (const name of docx) {
    const file = path.join(TEMPLATES_DIR, name);
    const buf = await fs.readFile(file);
    const zip = new PizZip(buf);
    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      console.log(`SKIP ${name} — no word/document.xml`);
      continue;
    }
    const xml = docFile.asText();
    const { xml: fixed, counts } = fixXml(xml);
    const changed = counts.dr + counts.checkbox + counts.bp;
    if (changed === 0) {
      console.log(`·   ${name.padEnd(40)}  (clean)`);
      continue;
    }
    zip.file("word/document.xml", fixed);
    const out = zip.generate({ type: "nodebuffer" });
    await fs.writeFile(file, out);
    console.log(
      `✓   ${name.padEnd(40)}  Dr=${counts.dr}  ☐=${counts.checkbox}  BP×2=${counts.bp}`,
    );
    totalDr += counts.dr;
    totalCheckbox += counts.checkbox;
    totalBp += counts.bp;
    touched++;
  }

  console.log("");
  console.log(
    `Patched ${touched} template(s). Totals: Dr=${totalDr}  ☐=${totalCheckbox}  BP×2=${totalBp}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
