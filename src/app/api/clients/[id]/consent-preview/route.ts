// POST /api/clients/[id]/consent-preview — render the consent DOCX with a
// transient signature embedded so the FO can review the document BEFORE
// committing the signature to the database. Returns DOCX (or PDF when
// ?format=pdf), but never writes to the DB.
//
// Body shape: { signatureDataUrl: "data:image/png;base64,...", method: "DIGITAL_PAD" | "PHYSICAL_SCAN" }
//
// The "real" save still goes through POST /api/clients/[id]/consent.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { renderDocxTemplate, convertDocxToPdf } from "@/lib/templates/docx";
import { CATEGORY_KEYS, type ServiceCategoryKey } from "@/lib/categories";

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

const bodySchema = z.object({
  signatureDataUrl: z.string().min(1).max(5_000_000),
  method: z.enum(["DIGITAL_PAD", "PHYSICAL_SCAN"]).optional(),
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

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx";

  const intake = client.intakeForms[0] ?? null;
  const selected = parseSelectedCategories(intake?.selectedCategories ?? null);
  // Match the persisted render: ticked-only, no empty boxes.
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
    // Use the transient signature from the request body, NOT what's on file.
    // This is the whole point of the preview endpoint.
    patientSignature: parsed.data.signatureDataUrl,
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
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="consent-preview-${client.clientCode}.pdf"`,
        },
      });
    } catch (err) {
      console.error("[consent preview] PDF conversion failed; returning DOCX", err);
    }
  }

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
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-IN", { month: "short" });
  return `${day} ${month} ${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
