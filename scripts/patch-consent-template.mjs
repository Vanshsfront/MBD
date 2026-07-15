// Dependency-free patcher for templates/COMMON_PATIENT_INTAKE_FORM.docx.
// Uses system unzip/zip to edit word/document.xml in-place.

import { mkdtemp, readFile, rm, writeFile, copyFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = process.cwd();
const template = path.join(root, "templates", "COMMON_PATIENT_INTAKE_FORM.docx");

const replacements = [
  [
    "I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge.",
    "1. Informed consent: I confirm that the information provided by me in this form is accurate, true, and complete to the best of my knowledge.",
  ],
  [
    "I understand that services at MBD include, but are not limited to, physiotherapy, strength &amp; conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness.",
    "2. Treatment acknowledgement: I understand that services at MBD include, but are not limited to, physiotherapy, strength &amp; conditioning, massage therapy, yoga, nutrition guidance, counselling, and preventive wellness.",
  ],
  [
    "I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions.",
    "3. Liability waiver: I further acknowledge that MBD, including its doctors, therapists, staff, and consultants, shall not be held liable for any unforeseen reactions, injuries, or outcomes arising from incomplete disclosure of information, non-compliance with recommended protocols, and/or pre-existing medical conditions.",
  ],
  ["Terms &amp;", "4. Commercial terms, cancellation policy, and Terms of Service"],
  [" Clinic Policies", ""],
  [
    "I have read, understood, and agree to all above terms &amp; policies.",
    "I have read, understood, and agree to all above terms, policies, and the Terms of Service.",
  ],
];

const patientNameParagraphNeedle = '<w:p w14:paraId="07AF1037"';
const ackParagraph =
  '<w:p w14:paraId="56A81D3E" w14:textId="77777777" w:rsidR="006E47A4" w:rsidRDefault="006E47A4" w:rsidP="00E12834">' +
  '<w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr></w:pPr>' +
  '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>{{termsOfService.acknowledgement}}</w:t></w:r>' +
  "</w:p>";

const spacerParagraph =
  '<w:p w14:paraId="08063CA2" w14:textId="77777777" w:rsidR="000C0466" w:rsidRDefault="000C0466" w:rsidP="000C0466"><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr></w:pPr></w:p>';
const leadingBrNeedle =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:br/><w:t>{{%patientSignature}}</w:t>';
const leadingBrReplacement =
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/></w:rPr><w:t>{{%patientSignature}}</w:t>';

const foNameNeedle = "<w:tab/><w:t>{{frontOffice.name}}</w:t>";
const foAlready = "{{%frontOffice.signature}}</w:t></w:r><w:r><w:br/>";
const foReplacement =
  "<w:tab/><w:t>{{%frontOffice.signature}}</w:t></w:r>" +
  '<w:r><w:br/><w:t xml:space="preserve">  {{frontOffice.name}}</w:t>';

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "mbd-consent-docx-"));
  try {
    await copyFile(template, path.join(dir, "template.docx"));
    await exec("unzip", ["-q", "template.docx"], { cwd: dir });
    const xmlPath = path.join(dir, "word", "document.xml");
    let xml = await readFile(xmlPath, "utf8");
    let changed = false;

    for (const [needle, replacement] of replacements) {
      if (replacement && xml.includes(replacement)) continue;
      if (xml.includes(needle)) {
        xml = xml.replace(needle, replacement);
        changed = true;
      }
    }

    xml = xml.replace(/<w:t xml:space="preserve"> Clinic Policies<\/w:t>/g, '<w:t xml:space="preserve"></w:t>');

    const withoutAck = xml.split(ackParagraph).join("");
    if (withoutAck !== xml) {
      xml = withoutAck;
      changed = true;
    }
    const patientNameIndex = xml.indexOf(patientNameParagraphNeedle);
    if (patientNameIndex === -1) throw new Error("Patient Name paragraph marker missing.");
    xml = `${xml.slice(0, patientNameIndex)}${ackParagraph}${xml.slice(patientNameIndex)}`;
    changed = true;

    if (xml.includes(spacerParagraph)) {
      xml = xml.replace(spacerParagraph, "");
      changed = true;
    }
    if (xml.includes(leadingBrNeedle)) {
      xml = xml.replace(leadingBrNeedle, leadingBrReplacement);
      changed = true;
    }
    if (!xml.includes(foAlready) && xml.includes(foNameNeedle)) {
      xml = xml.replace(foNameNeedle, foReplacement);
      changed = true;
    }

    if (!changed) {
      console.log("No changes needed.");
      return;
    }

    await writeFile(xmlPath, xml);
    await unlink(path.join(dir, "template.docx"));
    await exec("zip", ["-qr", "patched.docx", "."], { cwd: dir });
    await copyFile(path.join(dir, "patched.docx"), template);
    console.log("Patched COMMON_PATIENT_INTAKE_FORM.docx.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
