// Server-only cache loader for the permissions override table. Lives in
// its own file so the client-safe permissions.ts can be imported from
// React Server / Client components without pulling Prisma + `pg` into the
// browser bundle.

import "server-only";
import { prisma } from "./prisma";
import { _setPermissionOverrides, _permissionOverrideLoadedAt } from "./permissions";

const TTL_MS = 10_000;

export async function ensurePermissionsCacheFresh(): Promise<void> {
  const loadedAt = _permissionOverrideLoadedAt();
  if (loadedAt !== null && Date.now() - loadedAt < TTL_MS) return;
  const rows = await prisma.rolePermission.findMany({
    select: { role: true, permission: true, granted: true },
  });
  _setPermissionOverrides(rows);
}
