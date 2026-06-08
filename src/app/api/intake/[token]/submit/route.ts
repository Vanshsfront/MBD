// Public endpoint: patient submits intake form via QR-code link.
// Creates Client(DRAFT) + IntakeForm + flips IntakeToken.status=COMPLETED.
// Audit log uses the token's createdById as the performer (the FO who issued
// the QR) so the trail still has a real Staff actor.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { CATEGORY_KEYS } from "@/lib/categories";
import { enforce, clientIp } from "@/lib/rate-limit";

// Required-field policy:
//   - Mandatory per chat (3 Apr / 6 Apr): firstName, lastName, phone, email,
//     dob, sex, address (line1+city+pincode), emergency (name+phone+relationship).
//   - Mandatory per PRD §4 A3: at least one selectedCategory + all 4 acknowledgements.
//   - Optional: occupation, sport, age (auto-derived from dob), othersText.
// The browser form mirrors these; this is the last line of defense for any
// caller who bypasses the UI.
const intakeSchema = z.object({
  firstName: z.string().trim().min(1, "first_name_required").max(80),
  lastName: z.string().trim().min(1, "last_name_required").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("email_invalid")
    // Reject single-character TLDs (foo@bar.x) — Zod's .email() allows them.
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "email_invalid")
    .max(120),
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
  agreedToTerms: z.literal(true, { message: "terms_required" }),
}).refine(
  // Emergency contact must be a different number — server-side mirror of the
  // UI rule. Compare digits only so "+91 9876543210" and "9876543210" match.
  (data) => {
    const a = data.phone.replace(/\D/g, "");
    const b = data.emergencyPhone.replace(/\D/g, "");
    return !a || !b || a !== b;
  },
  {
    message: "emergency_phone_must_differ",
    path: ["emergencyPhone"],
  },
);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Public endpoint — rate-limit before DB lookups so token-existence timing
  // can't be probed at scale. 10 attempts/min/IP is generous for a single
  // patient filling out the form; abusive at the kind of volume needed for
  // brute-forcing CUIDs. Reference: audit-2026-06-06.md F-005, API-001.
  const rl = enforce(`intake-submit:${clientIp(req)}`, 10, 60 * 1000);
  if (rl) return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });

  const { token } = await params;
  const tokenRow = await prisma.intakeToken.findUnique({
    where: { token },
    include: { centre: true },
  });

  if (!tokenRow) {
    return NextResponse.json({ error: "invalid token" }, { status: 404 });
  }
  if (tokenRow.status !== "PENDING") {
    return NextResponse.json({ error: "token already used or expired" }, { status: 410 });
  }
  if (tokenRow.expiresAt < new Date()) {
    await prisma.intakeToken.update({
      where: { id: tokenRow.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "token expired" }, { status: 410 });
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

  const centreSlug = tokenRow.centre?.slug ?? "COL-MBD";

  // Server-side compute of age from dob — the form sends `age` as a hint
  // only; we trust the dob and recompute so the audit trail is consistent.
  const dob = new Date(f.dob);
  const computedAge = (() => {
    const now = new Date();
    let a = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) a--;
    return Math.max(0, a);
  })();

  const result = await prisma.$transaction(async (tx) => {
    // Atomic, race-safe client code via a per-centre counter (mirrors
    // InvoiceCounter). Initialised from the current count on first use so it
    // continues past seeded codes. The increment holds a row lock, so
    // concurrent intakes get distinct sequences.
    let seq: number;
    if (tokenRow.centreId) {
      const existing = await tx.clientCodeCounter.findUnique({ where: { centreId: tokenRow.centreId } });
      if (!existing) {
        const base = await tx.client.count({ where: { centreId: tokenRow.centreId } });
        await tx.clientCodeCounter.create({ data: { centreId: tokenRow.centreId, lastSequence: base } });
      }
      const updated = await tx.clientCodeCounter.update({
        where: { centreId: tokenRow.centreId },
        data: { lastSequence: { increment: 1 } },
      });
      seq = updated.lastSequence;
    } else {
      seq = (await tx.client.count()) + 1;
    }
    const clientCode = `${centreSlug}-${seq.toString().padStart(4, "0")}`;

    const client = await tx.client.create({
      data: {
        clientCode,
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        phone: f.phone,
        dob,
        age: computedAge,
        sex: f.sex,
        occupation: f.occupation ?? null,
        sport: f.sport ?? null,
        address: JSON.stringify({
          line1: f.addressLine1,
          city: f.addressCity,
          pincode: f.addressPincode,
        }),
        emergencyContact: JSON.stringify({
          name: f.emergencyName,
          phone: f.emergencyPhone,
          relationship: f.emergencyRelationship,
        }),
        visitReasons: JSON.stringify(f.selectedCategories),
        status: "DRAFT",
        centreId: tokenRow.centreId,
      },
    });

    const intakeForm = await tx.intakeForm.create({
      data: {
        clientId: client.id,
        selectedCategories: JSON.stringify(f.selectedCategories),
        formData: JSON.stringify({ othersText: f.othersText ?? "" }),
        consentSigned: false,
        liabilityWaiverSigned: false,
        commercialTermsAccepted: f.commercialTerms,
        cancellationPolicyAcknowledged: f.cancellationPolicy,
      },
    });

    await tx.intakeToken.update({
      where: { id: tokenRow.id },
      data: { status: "COMPLETED", isUsed: true, clientId: client.id, formData: JSON.stringify(f) },
    });

    return { client, intakeForm, clientCode };
  });

  // Audit — use the FO who issued the token as performer (public flow has
  // no logged-in user). Falls back to the system if no creator.
  const performer = tokenRow.createdById;
  if (performer) {
    await createAuditLog({
      action: "CREATE",
      entity: "Client",
      entityId: result.client.id,
      performedById: performer,
      changes: { clientCode: { old: null, new: result.clientCode }, status: { old: null, new: "DRAFT" } },
      metadata: { source: "public-intake", tokenId: tokenRow.id },
    });
    await createAuditLog({
      action: "CREATE",
      entity: "IntakeForm",
      entityId: result.intakeForm.id,
      performedById: performer,
      metadata: { source: "public-intake", clientId: result.client.id },
    });
    await createAuditLog({
      action: "UPDATE",
      entity: "IntakeToken",
      entityId: tokenRow.id,
      performedById: performer,
      changes: { status: { old: "PENDING", new: "COMPLETED" } },
    });
  }

  return NextResponse.json({ ok: true, clientId: result.client.id });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Public endpoint — limit token-validity probes to 30/min/IP. Higher than
  // POST since legitimate UIs poll this on form open.
  const rl = enforce(`intake-get:${clientIp(req)}`, 30, 60 * 1000);
  if (rl) return NextResponse.json(rl.body, { status: rl.status, headers: rl.headers });

  const { token } = await params;
  const tokenRow = await prisma.intakeToken.findUnique({
    where: { token },
    select: { status: true, expiresAt: true },
  });
  if (!tokenRow) return NextResponse.json({ valid: false, reason: "not_found" }, { status: 404 });
  const expired = tokenRow.expiresAt < new Date();
  if (expired || tokenRow.status === "EXPIRED") {
    return NextResponse.json({ valid: false, reason: "expired" });
  }
  if (tokenRow.status !== "PENDING") {
    return NextResponse.json({ valid: false, reason: "already_used" });
  }
  return NextResponse.json({ valid: true, expiresAt: tokenRow.expiresAt });
}
