// Render the COMMON PATIENT INTAKE FORM prefilled with the patient's data.
// Returns DOCX by default, or PDF if ?format=pdf is passed (LibreOffice).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertCentreScope } from "@/lib/api-auth";
import { renderDocxTemplate, convertDocxToPdf } from "@/lib/templates/docx";
import { CATEGORY_KEYS, SERVICE_CATEGORIES, type ServiceCategoryKey } from "@/lib/categories";
import { phiHeaders } from "@/lib/responses";

interface AddressJson {
  line1?: string;
  city?: string;
  pincode?: string;
}

interface EmergencyJson {
  name?: string;
  phone?: string;
  relationship?: string;
}

export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx";

  const intake = client.intakeForms[0] ?? null;
  const selected = parseSelectedCategories(intake?.selectedCategories ?? null);
  // Only render a checkbox next to categories the patient actually picked.
  // Previously we wrote "☐" for the unticked ones, which made the form look
  // like a paper questionnaire where every category appeared twice (the
  // empty box + a ticked one elsewhere). Empty string here drops the box
  // entirely so the consent reads as a clean summary of selections.
  const checkboxMap: Record<string, string> = {};
  for (const k of CATEGORY_KEYS) checkboxMap[k] = selected.includes(k) ? "☑" : "";

  const othersText = parseOthersText(intake?.formData ?? null);
  const address = client.address ? (JSON.parse(client.address) as AddressJson) : {};
  const emergency = client.emergencyContact
    ? (JSON.parse(client.emergencyContact) as EmergencyJson)
    : {};

  const assignedNames = client.doctorAssignments
    .map((a) => a.staff?.name)
    .filter((n): n is string => !!n);
  const fullAddress = [address.line1, address.city, address.pincode].filter(Boolean).join(", ");

  const data = {
    visitDate: formatDate(intake?.createdAt ?? client.createdAt),
    visitTime: formatTime(intake?.createdAt ?? client.createdAt),
    patient: {
      name: `${client.firstName} ${client.lastName}`.trim(),
      dob: client.dob ? formatDate(client.dob) : "",
      age: client.age != null ? String(client.age) : "",
      sex: client.sex ?? "",
      phone: client.phone,
      email: client.email ?? "",
      address: fullAddress,
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
    // Both fall back to a 1x1 transparent PNG when the data URL is empty —
    // the renderer never crashes for un-signed templates.
    patientSignature: intake?.signatureDataUrl ?? "",
    frontOffice: {
      name: auth.user.name ?? "",
      signature: foSignature?.signatureDataUrl ?? "",
    },
  };

  const docxBuf = await renderDocxTemplate("common-intake", data);

  if (format === "pdf") {
    try {
      const pdf = await convertDocxToPdf(docxBuf);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: phiHeaders({
          contentType: "application/pdf",
          filename: `consent-${client.clientCode}.pdf`,
          disposition: "inline",
        }),
      });
    } catch (err) {
      // LibreOffice missing/crashed/timed out — never 500; fall back to the
      // editable DOCX so the FO still gets the consent document.
      console.error("[consent render] PDF conversion failed; returning DOCX", err);
    }
  }

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
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-IN", { month: "short" });
  return `${day} ${month} ${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// Suppress unused-import lint for SERVICE_CATEGORIES (used only for types
// elsewhere; explicit reference here keeps tree-shaking honest).
void SERVICE_CATEGORIES;
