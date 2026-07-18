// Change spec 10 C — physician consultation template surgery.
//
// The three yellow boxes (LAB INVESTIGATIONS, DIAGNOSTIC IMAGING, INTERNAL
// REFERENCE) were each stored as an mc:AlternateContent pair: a modern
// mc:Choice drawing AND a legacy mc:Fallback VML twin holding the same text.
// docxtemplater renders both, and some Word rendering paths draw both on top of
// one another — the doubled/overlapping text the client reported.
//
// Worse, the boxes were static: every consultation printed the full preset list
// regardless of what the doctor ticked. This script:
//   1. Unwraps each box to keep only the modern Choice drawing (kills the
//      duplicate that caused the overlap).
//   2. For LAB and IMAGING, replaces the fixed list with a single placeholder
//      ({{labInvestigations}} / {{diagnosticImaging}}) fed by the doctor's
//      actual selections (see src/lib/physician-investigations.ts). An empty
//      selection prints an empty box.
//   3. Leaves INTERNAL REFERENCE's content as-is (spec 10 C item 3) — it's only
//      de-duplicated.
//
// Idempotent: re-running detects the applied marker and no-ops.
//
// Run: node --import tsx scripts/fix-physician-template-investigations.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const TEMPLATE = path.join(process.cwd(), "templates", "PHYSICIAN_CONSULTATION.docx");

function must(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** First `<w:p>…</w:p>` in a fragment (the box heading), with bookmarks stripped. */
function firstParagraph(fragment: string): string {
  const m = fragment.match(/<w:p\b[\s\S]*?<\/w:p>/);
  must(m !== null, "box had no paragraph");
  return stripBookmarks(m[0]);
}

/** Remove bookmark markers so dropping list paragraphs can't orphan one. */
function stripBookmarks(xml: string): string {
  return xml
    .replace(/<w:bookmarkStart\b[^>]*\/>/g, "")
    .replace(/<w:bookmarkEnd\b[^>]*\/>/g, "");
}

/**
 * A plain black Times 20pt paragraph carrying `inner` (text or a {{tag}}).
 * Matches the list items' body style so the tag output reads the same.
 */
function tagParagraph(tag: string): string {
  const rpr =
    '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:color w:val="000000" w:themeColor="text1"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
  return (
    `<w:p><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>${rpr}</w:pPr>` +
    `<w:r>${rpr}<w:t xml:space="preserve">${tag}</w:t></w:r></w:p>`
  );
}

/**
 * Rewrite one box. `tag` null → REF box: unwrap only, keep content. Otherwise
 * keep the heading paragraph and replace the rest with the tag paragraph.
 */
function rewriteBox(alternateContent: string, tag: string | null): string {
  const choice = alternateContent.match(/<mc:Choice\b[^>]*>([\s\S]*?)<\/mc:Choice>/);
  must(choice !== null, "box had no mc:Choice");
  let drawing = choice[1];

  if (tag !== null) {
    const txbx = drawing.match(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/);
    must(txbx !== null, "box drawing had no txbxContent");
    const rebuilt = firstParagraph(txbx[1]) + tagParagraph(tag);
    drawing = drawing.replace(
      txbx[0],
      `<w:txbxContent>${rebuilt}</w:txbxContent>`,
    );
  }
  // Replacing the AlternateContent with just the Choice drawing drops the
  // Fallback twin. The AC sat inside a <w:r>, and a run may hold a drawing
  // directly, so this stays valid.
  return drawing;
}

async function main(): Promise<void> {
  const zip = new PizZip(await fs.readFile(TEMPLATE));
  let xml = zip.file("word/document.xml")!.asText();

  if (xml.includes("{{labInvestigations}}")) {
    console.log("[physician-template] already patched — nothing to do");
    return;
  }

  const blocks = xml.match(/<mc:AlternateContent\b[\s\S]*?<\/mc:AlternateContent>/g) ?? [];
  must(blocks.length === 3, `expected 3 yellow boxes, found ${blocks.length}`);

  for (const block of blocks) {
    const text = block.replace(/<[^>]+>/g, " ");
    let tag: string | null;
    if (/CBC/.test(text)) tag = "{{labInvestigations}}";
    else if (/X-?Ray|DEXA/.test(text)) tag = "{{diagnosticImaging}}";
    else tag = null; // INTERNAL REFERENCE — de-dupe only
    xml = xml.replace(block, rewriteBox(block, tag));
  }

  must(xml.includes("{{labInvestigations}}"), "lab tag was not injected");
  must(xml.includes("{{diagnosticImaging}}"), "imaging tag was not injected");
  must(
    !/<mc:AlternateContent\b/.test(xml),
    "an AlternateContent block survived — overlap would remain",
  );

  zip.file("word/document.xml", xml);
  await fs.writeFile(TEMPLATE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("[physician-template] patched PHYSICIAN_CONSULTATION.docx");
}

main().catch((err) => {
  console.error("[physician-template] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
