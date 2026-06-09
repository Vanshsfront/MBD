// SUPPLY-001 verification: confirm the xmldom → @xmldom/xmldom override
// does not break docxtemplater-image-module-free. We render one real
// template (common-intake — the consent form) with a placeholder signature
// data URL embedded via the image module. If the override is broken, the
// docxtemplater + ImageModule chain throws at render time.

import { promises as fs } from "node:fs";
import path from "node:path";
import { renderDocxTemplate } from "../src/lib/templates/docx";

// 1×1 transparent PNG as a base64 data URL — minimal valid input to the
// image-module getImage() decoder, exercises the xmldom XML parse path.
const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function main() {
  const outDir = path.join(process.cwd(), "tmp", "smoke");
  await fs.mkdir(outDir, { recursive: true });

  const data = {
    visitDate: "09 Jun 2026",
    visitTime: "10:30 AM",
    patient: {
      name: "Smoke Test Patient",
      dob: "01 Jan 1990",
      age: "36",
      sex: "M",
      phone: "+91 99999 00000",
      email: "smoke@test.local",
      address: "Test Address, Test City, 400001",
    },
    emergency: { name: "Test Contact", phone: "+91 99999 00001" },
    r: { othersText: "" },
    assignedTo: "Dr. Smoke Test",
    assignedBy: "smoke-script",
    patientSignature: TRANSPARENT_PNG,
    frontOffice: { name: "Smoke FO", signature: TRANSPARENT_PNG },
  };

  console.log("[smoke-xmldom] rendering common-intake template…");
  const docxBuf = await renderDocxTemplate("common-intake", data);
  const outPath = path.join(outDir, "smoke-xmldom-override.docx");
  await fs.writeFile(outPath, docxBuf);
  console.log(`[smoke-xmldom] OK — wrote ${docxBuf.length} bytes to ${outPath}`);
}

main().catch((err) => {
  console.error("[smoke-xmldom] FAILED:", err);
  process.exit(1);
});
