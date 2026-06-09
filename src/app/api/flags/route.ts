// Client flags CRUD. PRD §3.1 admin:client_flags. FO/Admin/Owner can manage.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requestMeta, assertCentreScope } from "@/lib/api-auth";
import { createAuditLog } from "@/lib/audit";

const createSchema = z.object({
  clientId: z.string().min(1),
  type: z.enum(["VIP", "CAUTION", "OVERDUE", "FOLLOWUP", "CUSTOM"]),
  label: z.string().min(1).max(60),
  color: z.string().max(20).default("yellow"),
  notes: z.string().max(500).optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  label: z.string().min(1).max(60).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const auth = await requirePermission("admin:client_flags");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // AUTHZ-IDOR-001: gate cross-centre flag creation. The body's clientId can
  // be any ID — without this, Centre-A admin could tag a Centre-B patient.
  const target = await prisma.client.findUnique({
    where: { id: f.clientId },
    select: { centreId: true },
  });
  if (!target) return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  const scope = await assertCentreScope(auth.user, target);
  if (scope) return scope;

  const flag = await prisma.clientFlag.create({
    data: {
      clientId: f.clientId,
      type: f.type,
      label: f.label,
      color: f.color,
      notes: f.notes ?? null,
      createdById: auth.user.id,
    },
  });

  const meta = requestMeta(req);
  await createAuditLog({
    action: "CREATE",
    entity: "ClientFlag",
    entityId: flag.id,
    performedById: auth.user.id,
    metadata: { clientId: f.clientId, type: f.type, label: f.label },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true, id: flag.id });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("admin:client_flags");
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const existing = await prisma.clientFlag.findUnique({
    where: { id: f.id },
    include: { client: { select: { centreId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // AUTHZ-IDOR-001: scope updates by the flag's owning-client centre.
  const scope = await assertCentreScope(auth.user, existing.client);
  if (scope) return scope;

  const updated = await prisma.clientFlag.update({
    where: { id: f.id },
    data: {
      ...(f.isActive !== undefined ? { isActive: f.isActive } : {}),
      ...(f.label !== undefined ? { label: f.label } : {}),
      ...(f.notes !== undefined ? { notes: f.notes } : {}),
    },
  });

  await createAuditLog({
    action: "UPDATE",
    entity: "ClientFlag",
    entityId: f.id,
    performedById: auth.user.id,
    changes: {
      isActive: { old: existing.isActive, new: updated.isActive },
      label: { old: existing.label, new: updated.label },
    },
  });

  return NextResponse.json({ ok: true });
}
