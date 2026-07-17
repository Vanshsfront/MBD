// POST /api/clients/[id]/consent-preview — render the consent DOCX with a
// transient signature embedded so the FO can review the document BEFORE
// committing the signature to the database. Returns the DOCX, but never
// writes to the DB. (Server-side PDF conversion was removed — see
// src/lib/templates/docx.ts — so any ?format=pdf param is ignored.)
//
// Body shape: { signatureDataUrl: "data:image/png;base64,...", method: "DIGITAL_PAD" | "PHYSICAL_SCAN" }
//
// The "real" save still goes through POST /api/clients/[id]/consent.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { renderDocxTemplate } from "@/lib/templates/docx";
import { CATEGORY_KEYS, type ServiceCategoryKey } from "@/lib/categories";
import { formatAddress, parseAddress } from "@/lib/address";
import { formatPatientName } from "@/lib/patient-display";
import { guardianBlock } from "@/lib/consent-guardian";
import { formatClinicDate, formatClinicTime } from "@/lib/date-format";

interface EmergencyJson {
  name?: string;
  phone?: string;
  relationship?: string;
}

const bodySchema = z.object({
  signatureDataUrl: z.string().min(1).max(11 * 1024 * 1024),
  method: z.enum(["DIGITAL_PAD", "PHYSICAL_SCAN"]).optional(),
  guardianSignatureDataUrl: z.string().min(1).max(11 * 1024 * 1024).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("patients:assign_therapist");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = (await req.json()) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      intakeForms: { orderBy: { createdAt: "desc" }, take: 1 },
      doctorAssignments: {
        where: { endedAt: null },
        include: { staff: { select: { name: true } } },
      },
    },
  });
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const foSignature = await prisma.staff.findUnique({
    where: { id: auth.user.id },
    select: { signatureDataUrl: true },
  });


  const intake = client.intakeForms[0] ?? null;
  const termsDocument = intake?.termsOfServiceVersion
    ? await prisma.legalDocument.findUnique({
        where: {
          key_version: {
            key: "TERMS_OF_SERVICE",
            version: intake.termsOfServiceVersion,
          },
        },
        select: { effectiveDate: true },
      })
    : null;
  const selected = parseSelectedCategories(intake?.selectedCategories ?? null);
  // Match the persisted render: ticked-only, no empty boxes.
  const checkboxMap: Record<string, string> = {};
  for (const k of CATEGORY_KEYS) checkboxMap[k] = selected.includes(k) ? "☑" : "";

  const othersText = parseOthersText(intake?.formData ?? null);
  const address = parseAddress(client.address);
  const emergency = client.emergencyContact
    ? (JSON.parse(client.emergencyContact) as EmergencyJson)
    : {};

  const assignedNames = client.doctorAssignments
    .map((a) => a.staff?.name)
    .filter((n): n is string => !!n);
  const fullAddress = formatAddress(address);

  const data = {
    visitDate: formatDate(intake?.createdAt ?? client.createdAt),
    visitTime: formatTime(intake?.createdAt ?? client.createdAt),
    patient: {
      name: formatPatientName(client),
      dob: client.dob ? formatDate(client.dob) : "",
      age: client.age != null ? String(client.age) : "",
      sex: client.sex ?? "",
      phone: client.phone,
      email: client.email ?? "",
      address: fullAddress,
    },
    termsOfService: {
      agreed: intake?.termsOfServiceAgreed ? "Yes" : "No",
      version: intake?.termsOfServiceVersion ?? "",
      agreedAt: intake?.termsOfServiceAgreedAt ? formatDate(intake.termsOfServiceAgreedAt) : "",
      acknowledgement: intake?.termsOfServiceAgreed
        ? `Patient has agreed to Terms of Service v${intake.termsOfServiceVersion ?? ""}, effective ${
            termsDocument?.effectiveDate ? formatDate(termsDocument.effectiveDate) : ""
          }, acknowledged ${intake.termsOfServiceAgreedAt ? formatDate(intake.termsOfServiceAgreedAt) : ""}.`
        : "Terms of Service agreement is not recorded.",
    },
    emergency: {
      name: emergency.name ?? "",
      phone: emergency.phone ?? "",
    },
    r: {
      ...checkboxMap,
      othersText,
    },
    assignedTo: assignedNames.join(", "),
    assignedBy: auth.user.name ?? auth.user.email ?? "",
    guardian: guardianBlock(intake),
    // Use the transient signature from the request body, NOT what's on file.
    // This is the whole point of the preview endpoint.
    patientSignature: parsed.data.signatureDataUrl,
    // Preview runs before anything is persisted, so the guardian signature can
    // only come from the body — see guardianSignatureDataUrl in the schema.
    guardianSignature: parsed.data.guardianSignatureDataUrl ?? "",
    frontOffice: {
      name: auth.user.name ?? "",
      signature: foSignature?.signatureDataUrl ?? "",
    },
  };

  const docxBuf = await renderDocxTemplate("common-intake", data);

  return new NextResponse(new Uint8Array(docxBuf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="consent-preview-${client.clientCode}.docx"`,
    },
  });
}

function parseSelectedCategories(json: string | null): ServiceCategoryKey[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      return arr.filter((k): k is ServiceCategoryKey =>
        (CATEGORY_KEYS as readonly string[]).includes(k as string),
      );
    }
  } catch {
    // ignore
  }
  return [];
}

function parseOthersText(json: string | null): string {
  if (!json) return "";
  try {
    const obj = JSON.parse(json) as { othersText?: string };
    return obj.othersText ?? "";
  } catch {
    return "";
  }
}

function formatDate(d: Date): string {
  return formatClinicDate(d, { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(d: Date): string {
  return formatClinicTime(d, { hour: "2-digit", minute: "2-digit", hour12: true });
}
