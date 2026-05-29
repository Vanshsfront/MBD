// Admin staff CRUD — create, edit (incl. role/department/centre), password
// reset, activate/deactivate, and remove (soft-delete when there's history).
// Gated to admin:manage_staff (OWNER, ADMIN, DEV per PRD §3.1). performedById
// is always derived from the session — never trusted from the body.

import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta } from "@/lib/api-auth";
import { createAuditLog, computeChanges } from "@/lib/audit";
import { activeCentreId } from "@/lib/centre";
import { BCRYPT_COST } from "@/lib/auth";

// Roles an admin may create/assign through this UI. OWNER is singular and DEV
// is provisioned out-of-band (and gated to non-prod), so neither is creatable.
const ASSIGNABLE_ROLES = ["ADMIN", "FRONT_OFFICE", "CONSULTANT", "THERAPIST"] as const;

// Calendar colour: a #RRGGBB / #RGB hex, or null to fall back to the
// deterministic palette colour derived from the staff id.
const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex colour")
  .nullish();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  password: z.string().min(6).max(60),
  role: z.enum(ASSIGNABLE_ROLES),
  departmentId: z.string().min(1).nullish(),
  centreId: z.string().min(1).nullish(),
  designation: z.string().max(120).nullish(),
  color: colorSchema,
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  departmentId: z.string().min(1).nullish(),
  centreId: z.string().min(1).nullish(),
  designation: z.string().max(120).nullish(),
  color: colorSchema,
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(6).max(60).optional(),
});

// ── Create ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = await requirePermission("admin:manage_staff");
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.staff.findUnique({ where: { email: f.email } });
  if (existing) {
    return NextResponse.json({ error: "email_exists" }, { status: 409 });
  }

  // Default new staff to the active centre so admins don't re-pick every time.
  const centreId = f.centreId ?? (await activeCentreId()) ?? null;

  const staff = await prisma.staff.create({
    data: {
      name: f.name,
      email: f.email,
      passwordHash: await hash(f.password, BCRYPT_COST),
      role: f.role,
      departmentId: f.departmentId ?? null,
      centreId,
      designation: f.designation ?? null,
      color: f.color ?? null,
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "Staff",
    entityId: staff.id,
    performedById: auth.user.id,
    metadata: { name: f.name, email: f.email, role: f.role, centreId },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, id: staff.id }, { status: 201 });
}

// ── Edit (full) + password reset + activate/deactivate ─────────────────────
export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:manage_staff");
  if (!auth.ok) return auth.response;

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.staff.findUnique({ where: { id: f.id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // The OWNER cannot be deactivated by anyone but themselves, and their role
  // can't be changed away from OWNER.
  if (existing.role === "OWNER" && f.isActive === false && auth.user.id !== existing.id) {
    return NextResponse.json({ error: "cannot_deactivate_owner" }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (f.name !== undefined) data.name = f.name;
  if (f.isActive !== undefined) data.isActive = f.isActive;
  if (f.designation !== undefined) data.designation = f.designation ?? null;
  if (f.color !== undefined) data.color = f.color ?? null;
  if (f.departmentId !== undefined) data.departmentId = f.departmentId ?? null;
  if (f.centreId !== undefined) data.centreId = f.centreId ?? null;
  // Don't reassign the OWNER/DEV away from their privileged role via this UI.
  if (f.role !== undefined && existing.role !== "OWNER" && existing.role !== "DEV") {
    data.role = f.role;
  }
  if (f.resetPassword) data.passwordHash = await hash(f.resetPassword, BCRYPT_COST);

  const updated = await prisma.staff.update({ where: { id: f.id }, data });

  const changes = computeChanges(
    {
      name: existing.name,
      role: existing.role,
      departmentId: existing.departmentId,
      centreId: existing.centreId,
      designation: existing.designation,
      color: existing.color,
      isActive: existing.isActive,
    },
    {
      name: updated.name,
      role: updated.role,
      departmentId: updated.departmentId,
      centreId: updated.centreId,
      designation: updated.designation,
      color: updated.color,
      isActive: updated.isActive,
    },
  );

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: f.id,
    performedById: auth.user.id,
    changes,
    metadata: f.resetPassword ? { passwordReset: true } : undefined,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}

// ── Remove (soft-delete when the staff has history) ────────────────────────
export async function DELETE(req: Request) {
  const auth = await requirePermission("admin:manage_staff");
  if (!auth.ok) return auth.response;

  const parsed = z.object({ id: z.string().min(1) }).safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 400 });
  }
  const { id } = parsed.data;

  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (existing.role === "OWNER") {
    return NextResponse.json({ error: "cannot_remove_owner" }, { status: 400 });
  }
  if (existing.role === "DEV") {
    return NextResponse.json({ error: "cannot_remove_dev" }, { status: 400 });
  }

  const [audits, sessions, consultations, appts, assigns] = await Promise.all([
    prisma.auditLog.count({ where: { performedById: id } }),
    prisma.session.count({ where: { therapistId: id } }),
    prisma.consultation.count({ where: { consultantId: id } }),
    prisma.appointment.count({ where: { therapistId: id } }),
    prisma.clientDoctorAssignment.count({ where: { staffId: id } }),
  ]);
  const hasHistory = audits + sessions + consultations + appts + assigns > 0;

  const meta = requestMeta(req);
  if (hasHistory) {
    await prisma.staff.update({ where: { id }, data: { isActive: false } });
    await createAuditLog({
      action: "UPDATE",
      entity: "Staff",
      entityId: id,
      performedById: auth.user.id,
      metadata: { name: existing.name, softDelete: true, reason: "has_history" },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, softDelete: true });
  }

  await prisma.staff.delete({ where: { id } });
  await createAuditLog({
    action: "DELETE",
    entity: "Staff",
    entityId: id,
    performedById: auth.user.id,
    metadata: { name: existing.name, email: existing.email },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return NextResponse.json({ ok: true });
}
