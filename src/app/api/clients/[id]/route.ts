// PATCH /api/clients/[id] — edit demographic fields. Used by the patient
// detail's "Edit demographics" dialog (FO + OWNER + DEV). The shape is the
// subset of Client fields the intake form captures so the FO can fix typos
// without having to walk the whole intake flow again.
//
// Audit-logged. The legacy build had no UI for this, which left FO without an
// in-app path to correct a misspelled phone number — see C10 in the audit.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta, assertCentreScope } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const addressSchema = z
  .object({
    line1: z.string().max(200).optional().nullable(),
    line2: z.string().max(200).optional().nullable(),
    city: z.string().max(80).optional().nullable(),
    pincode: z.string().max(20).optional().nullable(),
  })
  .nullable();

const emergencySchema = z
  .object({
    name: z.string().max(120).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    relationship: z.string().max(60).optional().nullable(),
  })
  .nullable();

const patchSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z.string().min(5).max(20).optional(),
  email: z.string().email().optional().nullable(),
  dob: z.string().datetime().optional().nullable(),
  age: z.number().int().min(0).max(150).optional().nullable(),
  sex: z.string().max(20).optional().nullable(),
  dominance: z.enum(["RIGHT", "LEFT", "AMBI"]).optional().nullable(),
  occupation: z.string().max(120).optional().nullable(),
  sport: z.string().max(120).optional().nullable(),
  maritalStatus: z.string().max(40).optional().nullable(),
  address: addressSchema.optional(),
  emergencyContact: emergencySchema.optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("patients:edit_demographics");
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;

  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }
  const scope = await assertCentreScope(auth.user, existing);
  if (scope) return scope;

  const body = (await req.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // Build the update payload — JSON-stringify address + emergency to match the
  // existing storage convention. Setting either to null clears it.
  const data: Record<string, unknown> = {};
  if (f.firstName !== undefined) data.firstName = f.firstName;
  if (f.lastName !== undefined) data.lastName = f.lastName;
  if (f.phone !== undefined) data.phone = f.phone;
  if (f.email !== undefined) data.email = f.email;
  if (f.dob !== undefined) data.dob = f.dob === null ? null : new Date(f.dob);
  if (f.age !== undefined) data.age = f.age;
  if (f.sex !== undefined) data.sex = f.sex;
  if (f.dominance !== undefined) data.dominance = f.dominance;
  if (f.occupation !== undefined) data.occupation = f.occupation;
  if (f.sport !== undefined) data.sport = f.sport;
  if (f.maritalStatus !== undefined) data.maritalStatus = f.maritalStatus;
  if (f.address !== undefined) {
    data.address = f.address === null ? null : JSON.stringify(f.address);
  }
  if (f.emergencyContact !== undefined) {
    data.emergencyContact =
      f.emergencyContact === null ? null : JSON.stringify(f.emergencyContact);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const updated = await prisma.client.update({ where: { id }, data });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Client",
    entityId: id,
    performedById: auth.user.id,
    metadata: {
      fields: Object.keys(data),
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    client: {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      email: updated.email,
    },
  });
}
