// Render a saved Consultation to its templated DOCX. (Server-side PDF
// conversion was removed — see src/lib/templates/docx.ts — so the optional
// ?format=pdf param is ignored and the DOCX is always returned.)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { hasPermission, isClinicalRole } from "@/lib/permissions";
import { renderDocxTemplate } from "@/lib/templates/docx";
import {
  DOCX_TEMPLATES,
  type DocxTemplateKey,
} from "@/lib/templates/keys";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: {
      client: true,
      consultant: {
        select: { id: true, name: true, designation: true, signatureDataUrl: true },
      },
    },
  });
  if (!consultation) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Clinical roles only see their own. FO/Owner/Admin/DEV: anyone.
  if (
    isClinicalRole(auth.user.role) &&
    consultation.consultantId !== auth.user.id
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!hasPermission(auth.user.role, "patients:view_assigned")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const templateKey = consultation.templateKey as DocxTemplateKey;
  if (!(templateKey in DOCX_TEMPLATES)) {
    return NextResponse.json({ error: "unknown_template", templateKey }, { status: 400 });
  }

  const formData = consultation.formData ? safeParse(consultation.formData) : {};
  const emergency = consultation.client.emergencyContact
    ? safeParse(consultation.client.emergencyContact)
    : {};

  // Spread the structured formData onto the render context. The placeholder
  // names in the DOCX templates were chosen to match these keys 1:1
  // (see scripts/inject-placeholders.ts + scripts/build-new-templates.ts).
  // We also rename a couple for the legacy follow-up templates that still
  // expect `c` (comorbidities) and `chiefComplaint` (singular).
  const data: Record<string, unknown> = {
    ...formData,
    visitDate: formatDate(consultation.date),
    patient: {
      name: `${consultation.client.firstName} ${consultation.client.lastName}`.trim(),
      code: consultation.client.clientCode,
      age: consultation.client.age != null ? String(consultation.client.age) : "",
      sex: consultation.client.sex ?? "",
      dominance: consultation.client.dominance ?? "",
      phone: consultation.client.phone,
      email: consultation.client.email ?? "",
      occupation: consultation.client.occupation ?? "",
      sport: consultation.client.sport ?? "",
      address: addressFor(consultation.client.address),
      maritalStatus: consultation.client.maritalStatus ?? "",
    },
    emergency: {
      name: typeof emergency.name === "string" ? emergency.name : "",
      phone: typeof emergency.phone === "string" ? emergency.phone : "",
      relationship: typeof emergency.relationship === "string" ? emergency.relationship : "",
    },
    therapist: { name: consultation.consultant.name },
    chiefComplaint: consultation.chiefComplaints ?? "",
    chiefComplaints: consultation.chiefComplaints ?? "",
    diagnosis: consultation.diagnosis ?? "",
    primaryGoal: consultation.planOfCare ?? "",
    planOfCare: consultation.planOfCare ?? "",
    followUp: consultation.followUp ?? "",
    knownAllergies: extract(formData, "knownAllergies"),
    injuries: extract(formData, "injuries"),
    vitals: extract(formData, "vitals", {}),
    // Legacy templates use `c` for comorbidities; new ones use `comorbidities`.
    c: extract(formData, "comorbidities", {}),
    comorbidities: extract(formData, "comorbidities", {}),
    sessions: extract(formData, "sessions", []),
    sessionsPage2: extract(formData, "sessionsPage2", []),
    // Image-module placeholder. Pass through the data URL; if absent, the
    // module embeds a 1×1 transparent PNG (see src/lib/templates/docx.ts).
    consultantSignature: consultation.consultant.signatureDataUrl ?? "",
    patientSignature: "",
  };

  const docxBuf = await renderDocxTemplate(templateKey, data);

  return new NextResponse(new Uint8Array(docxBuf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="consultation-${consultation.client.clientCode}-${consultation.id.slice(-6)}.docx"`,
    },
  });
}

function addressFor(json: string | null): string {
  if (!json) return "";
  const obj = safeParse(json) as { line1?: string; city?: string; pincode?: string };
  return [obj.line1, obj.city, obj.pincode].filter(Boolean).join(", ");
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const out = JSON.parse(s);
    return out && typeof out === "object" ? (out as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function extract<T>(
  obj: Record<string, unknown>,
  key: string,
  fallback?: T,
): T extends undefined ? string : T {
  const v = obj[key];
  if (v === undefined || v === null) {
    return (fallback ?? "") as T extends undefined ? string : T;
  }
  return v as T extends undefined ? string : T;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
