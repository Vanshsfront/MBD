// Render the COMMON PATIENT INTAKE FORM prefilled with the patient's data.
// Returns the filled DOCX. (Server-side PDF conversion was removed — see
// src/lib/templates/docx.ts — so the optional ?format=pdf param is ignored.)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertCentreScope } from "@/lib/api-auth";
import { renderDocxTemplate } from "@/lib/templates/docx";
import { CATEGORY_KEYS, SERVICE_CATEGORIES, type ServiceCategoryKey } from "@/lib/categories";
import { phiHeaders } from "@/lib/responses";
import { formatAddress, parseAddress } from "@/lib/address";
import { formatPatientName } from "@/lib/patient-display";
import { formatClinicDate, formatClinicTime } from "@/lib/date-format";

interface EmergencyJson {
  name?: string;
  phone?: string;
  relationship?: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("patients:assign_therapist");
  if (!auth.ok) return auth.response;
  const { id } = await params;

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
  const scope = await assertCentreScope(auth.user, client);
  if (scope) return scope;

  // Pull the FO's signature image (PRD §6.1: consent form has FO signature
  // slot). Patient signature is captured at /consent step and stored on
  // IntakeForm.signatureDataUrl.
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
  // Only render a checkbox next to categories the patient actually picked.
  // Previously we wrote "☐" for the unticked ones, which made the form look
  // like a paper questionnaire where every category appeared twice (the
  // empty box + a ticked one elsewhere). Empty string here drops the box
  // entirely so the consent reads as a clean summary of selections.
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

  const patientSignatureDataUrl = intake?.signatureDataUrl ?? "";
  const foSignatureDataUrl = foSignature?.signatureDataUrl ?? "";

  // Validate patient signature: must be a non-empty data URL.
  // This is a guard against rendering consent with invisible signatures due to
  // missing signature data (the image module silently falls back to 1x1 transparent PNG).
  const isValidDataUrl = (value: string): boolean =>
    typeof value === "string" && value.startsWith("data:image/") && value.length > 16;

  if (!isValidDataUrl(patientSignatureDataUrl)) {
    return NextResponse.json(
      { error: "patient_signature_missing" },
      { status: 422 },
    );
  }

  // Warn if FO signature is missing, but still render.
  // FO staff signatures are optional at the time of consent rendering; not all staff
  // may have signatures on file yet. This is a data-quality issue, not a blocker.
  if (!isValidDataUrl(foSignatureDataUrl)) {
    console.warn(
      `[consent-render] FO signature missing for staff ${auth.user.id} when rendering consent for client ${id}`,
    );
  }

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
    // Image-module placeholders ({{%patientSignature}} / {{%frontOffice.signature}}).
    // Patient signature is validated above (will not reach here if missing).
    // FO signature may be empty; the renderer falls back to 1x1 transparent PNG.
    patientSignature: patientSignatureDataUrl,
    frontOffice: {
      name: auth.user.name ?? "",
      signature: foSignatureDataUrl,
    },
  };

  const docxBuf = await renderDocxTemplate("common-intake", data);

  return new NextResponse(new Uint8Array(docxBuf), {
    status: 200,
    headers: phiHeaders({
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `consent-${client.clientCode}.docx`,
    }),
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

// Suppress unused-import lint for SERVICE_CATEGORIES (used only for types
// elsewhere; explicit reference here keeps tree-shaking honest).
void SERVICE_CATEGORIES;
