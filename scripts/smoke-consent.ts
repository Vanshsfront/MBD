// Render the COMMON_PATIENT_INTAKE_FORM with sample data.
// Confirms placeholder injection didn't break the template structure.

import { promises as fs } from "node:fs";
import path from "node:path";

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
    patientSignature: "Aarav Mehta",
    frontOffice: { name: "Ramchandra Bharankar", signature: "Ramchandra B." },
  };

  const docx = await renderDocxTemplate("common-intake", data);
  await fs.writeFile(path.join(OUT, "consent-rendered.docx"), docx);

  console.log("[smoke-consent] wrote consent-rendered.docx");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
