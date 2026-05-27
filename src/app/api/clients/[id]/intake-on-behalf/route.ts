// FO fills out the intake form on behalf of a walk-in patient who didn't
// come through the public QR flow. Legacy chat (Marazban, multiple quotes):
// "the intake form is the one which the front office is filling up… at the
// end of the intake form is a consent form." This is the missing capability —
// without it, the assign-queue → consent step crashes with `no_intake_form`
// for any client created outside the QR path (seeded clients, walk-ins
// captured at the desk, etc.).
//
// Schema mirrors /api/intake/[token]/submit so the same client component
// (IntakeFormShell) can drive both. Difference: this is auth-gated (FO
// permission), keyed by clientId, and refuses if an IntakeForm already
// exists for the client (the caller should be using the existing capture
// step instead).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { CATEGORY_KEYS } from "@/lib/categories";

const intakeSchema = z.object({
  firstName: z.string().trim().min(1, "first_name_required").max(80),
  lastName: z.string().trim().min(1, "last_name_required").max(80),
  email: z.string().trim().email("email_invalid").max(120),
  phone: z.string().trim().min(7, "phone_required").max(40),
  dob: z
    .string()
    .min(1, "dob_required")
    .refine((s) => !Number.isNaN(new Date(s).getTime()), "dob_invalid")
    .refine((s) => new Date(s) <= new Date(), "dob_in_future"),
  age: z.coerce.number().int().min(0).max(120).optional(),
  sex: z.enum(["M", "F", "OTHER"], { message: "sex_required" }),
  occupation: z.string().max(120).optional(),
  sport: z.string().max(120).optional(),
  addressLine1: z.string().trim().min(1, "address_line1_required").max(200),
  addressCity: z.string().trim().min(1, "address_city_required").max(80),
  addressPincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "pincode_invalid"),
  emergencyName: z.string().trim().min(1, "emergency_name_required").max(120),
  emergencyPhone: z.string().trim().min(7, "emergency_phone_required").max(40),
  emergencyRelationship: z
    .string()
    .trim()
    .min(1, "emergency_relationship_required")
    .max(40),
  selectedCategories: z
    .array(z.enum(CATEGORY_KEYS as [string, ...string[]]))
    .min(1, "categories_required"),
  othersText: z.string().max(500).optional(),
  consent: z.literal(true, { message: "consent_required" }),
  liabilityWaiver: z.literal(true, { message: "liability_required" }),
  commercialTerms: z.literal(true, { message: "commercial_required" }),
  cancellationPolicy: z.literal(true, { message: "cancellation_required" }),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("patients:assign_therapist");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: { intakeForms: { take: 1 } },
  });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  if (client.intakeForms.length > 0) {
    return NextResponse.json({ error: "intake_already_exists" }, { status: 400 });
  }

  const body = (await req.json()) as unknown;
  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;
  const meta = requestMeta(req);

  // Trust dob, recompute age (matches /api/intake/[token]/submit).
  const dob = new Date(f.dob);
  const computedAge = (() => {
    const now = new Date();
    let a = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
    return Math.max(0, a);
  })();

  // Patch demographic fields that are empty on the existing Client row —
  // never overwrite non-null values. The FO might already have entered a
  // first name when creating the stub patient; we respect that.
  const updateData: Record<string, unknown> = {
    visitReasons: JSON.stringify(f.selectedCategories),
  };
  if (!client.firstName?.trim()) updateData.firstName = f.firstName;
  if (!client.lastName?.trim()) updateData.lastName = f.lastName;
  if (!client.phone?.trim()) updateData.phone = f.phone;
  if (!client.email) updateData.email = f.email;
  if (!client.dob) {
    updateData.dob = dob;
    updateData.age = computedAge;
  } else if (client.age == null) {
    updateData.age = computedAge;
  }
  if (!client.sex) updateData.sex = f.sex;
  if (!client.occupation && f.occupation) updateData.occupation = f.occupation;
  if (!client.sport && f.sport) updateData.sport = f.sport;
  if (!client.address) {
    updateData.address = JSON.stringify({
      line1: f.addressLine1,
      city: f.addressCity,
      pincode: f.addressPincode,
    });
  }
  if (!client.emergencyContact) {
    updateData.emergencyContact = JSON.stringify({
      name: f.emergencyName,
      phone: f.emergencyPhone,
      relationship: f.emergencyRelationship,
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedClient = await tx.client.update({
      where: { id },
      data: updateData,
    });

    const intakeForm = await tx.intakeForm.create({
      data: {
        clientId: id,
        selectedCategories: JSON.stringify(f.selectedCategories),
        formData: JSON.stringify({ othersText: f.othersText ?? "" }),
        consentSigned: false,
        liabilityWaiverSigned: false,
        commercialTermsAccepted: f.commercialTerms,
        cancellationPolicyAcknowledged: f.cancellationPolicy,
        frontOfficeExecId: auth.user.id,
      },
    });

    return { client: updatedClient, intakeForm };
  });

  const changes = computeChanges(
    client as unknown as Record<string, unknown>,
    result.client as unknown as Record<string, unknown>,
    [
      "firstName",
      "lastName",
      "email",
      "phone",
      "dob",
      "age",
      "sex",
      "occupation",
      "sport",
      "address",
      "emergencyContact",
      "visitReasons",
    ],
  );
  if (changes) {
    await createAuditLog({
      action: "UPDATE",
      entity: "Client",
      entityId: id,
      performedById: auth.user.id,
      changes,
      metadata: { source: "intake-on-behalf" },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
  await createAuditLog({
    action: "CREATE",
    entity: "IntakeForm",
    entityId: result.intakeForm.id,
    performedById: auth.user.id,
    metadata: { source: "intake-on-behalf", clientId: id },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    intakeFormId: result.intakeForm.id,
    clientId: id,
  });
}
