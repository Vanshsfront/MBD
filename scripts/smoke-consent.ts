// Render the COMMON_PATIENT_INTAKE_FORM with sample data.
// Confirms placeholder injection didn't break the template structure.

import { promises as fs } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import PizZip from "pizzip";

import { renderDocxTemplate } from "../src/lib/templates/docx";

const OUT = path.join(process.cwd(), "tmp", "smoke");

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const data = {
    visitDate: "06 May 2026",
    visitTime: "10:30 AM",
    patient: {
      name: "Aarav Mehta",
      dob: "12 Apr 1992",
      age: "34",
      sex: "M",
      phone: "+91 98200 11122",
      email: "aarav.mehta@example.in",
      address: "Flat 4B, Sea Breeze Apartments, Colaba, Mumbai 400005",
    },
    emergency: { name: "Saanvi Mehta", phone: "+91 98201 11122" },
    r: {
      painInjury: "☑",
      physiotherapy: "☑",
      strengthConditioning: "☐",
      massage: "☐",
      yoga: "☐",
      nutrition: "☐",
      counselling: "☐",
      prevention: "☐",
      othersText: "",
    },
    assignedTo: "Dr. Devanshi Vira",
    assignedBy: "Ramchandra Bharankar",
    termsOfService: {
      acknowledgement:
        "Patient has agreed to Terms of Service v1.0, effective 01 Jun 2026, acknowledged 15 Jul 2026.",
    },
    patientSignature: "Aarav Mehta",
    frontOffice: { name: "Ramchandra Bharankar", signature: "Ramchandra B." },
  };

  const docx = await renderDocxTemplate("common-intake", data);
  await fs.writeFile(path.join(OUT, "consent-rendered.docx"), docx);

  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  assert.match(xml, /1\. Informed consent/);
  assert.match(xml, /2\. Treatment acknowledgement/);
  assert.match(xml, /3\. Liability waiver/);
  assert.match(xml, /4\. Commercial terms, cancellation policy, and Terms of Service/);
  assert.match(xml, /Terms of Service v1\.0/);
  assert.doesNotMatch(xml, /termsOfService\.acknowledgement/);

  console.log("[smoke-consent] wrote consent-rendered.docx and verified consent/ToS text");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
