// Permissions matrix editor — OWNER (and DEV) toggles whether a role has
// a given permission. Stored as RolePermission rows: presence overrides
// the hard-coded default in src/lib/permissions.ts; absence falls back.
//
// POST with `granted: true|false` upserts an override.
// DELETE with role+permission removes it (revert to default).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requestMeta } from "@/lib/api-auth";
import {
  PERMISSIONS,
  ROLES,
  invalidatePermissionsCache,
  type Permission,
  type Role,
} from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";

const RESTRICTED_TO = new Set<Role>(["OWNER", "DEV"]);

const upsertSchema = z.object({
  role: z.enum(ROLES as readonly [Role, ...Role[]]),
  permission: z.enum(PERMISSIONS as readonly [Permission, ...Permission[]]),
  granted: z.boolean(),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!RESTRICTED_TO.has(auth.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as unknown;
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  const result = await prisma.rolePermission.upsert({
    where: { role_permission: { role: f.role, permission: f.permission } },
    create: { role: f.role, permission: f.permission, granted: f.granted },
    update: { granted: f.granted },
  });

  // Bust the in-process cache so the next requirePermission() call reads
  // the new state.
  invalidatePermissionsCache();

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: f.role,
    performedById: auth.user.id,
    metadata: {
      kind: "role_permission_override",
      role: f.role,
      permission: f.permission,
      granted: f.granted,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ override: result });
}

const deleteSchema = z.object({
  role: z.enum(ROLES as readonly [Role, ...Role[]]),
  permission: z.enum(PERMISSIONS as readonly [Permission, ...Permission[]]),
});

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!RESTRICTED_TO.has(auth.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const params = {
    role: url.searchParams.get("role"),
    permission: url.searchParams.get("permission"),
  };
  const parsed = deleteSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  await prisma.rolePermission
    .delete({
      where: { role_permission: { role: f.role, permission: f.permission } },
    })
    .catch(() => null); // already-deleted is fine — desired state achieved

  invalidatePermissionsCache();

  const meta = requestMeta(req);
  await createAuditLog({
    action: "UPDATE",
    entity: "Staff",
    entityId: f.role,
    performedById: auth.user.id,
    metadata: {
      kind: "role_permission_revert_default",
      role: f.role,
      permission: f.permission,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
