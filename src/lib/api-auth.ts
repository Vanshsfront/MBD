// Helpers for API routes: resolve session + enforce permissions, returning
// either an error Response (for direct return) or the typed session info.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, type Permission, type Role } from "@/lib/permissions";
import { activeCentreId } from "@/lib/centre";
import { prisma } from "@/lib/prisma";

export interface ApiUser {
  id: string;
  name: string | null;
  role: Role;
  centreId: string | null;
  departmentId: string | null;
  email: string | null;
}

export type ApiAuthResult =
  | { ok: true; user: ApiUser }
  | { ok: false; response: NextResponse };

/**
 * Compare the JWT's session version with the staff row's. A mismatch means
 * the user (or an admin) has invalidated this session — return 401.
 *
 * Lookup is a single Staff.sessionVersion read per request. Acceptable cost
 * for protected endpoints; trade-off versus stale 8h JWTs that can't be
 * killed at logout. Reference: audit-2026-06-06 F-012.
 */
async function verifySessionVersion(userId: string, jwtVersion: number): Promise<boolean> {
  const row = await prisma.staff.findUnique({
    where: { id: userId },
    select: { sessionVersion: true, isActive: true },
  });
  if (!row || !row.isActive) return false;
  return jwtVersion >= row.sessionVersion;
}

/**
 * Resolve the session and verify the caller has the given permission. Returns
 * a discriminated union — callers use `if (!result.ok) return result.response`.
 */
export async function requirePermission(permission: Permission): Promise<ApiAuthResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const versionOk = await verifySessionVersion(session.user.id, session.user.sessionVersion ?? 0);
  if (!versionOk) {
    return { ok: false, response: NextResponse.json({ error: "session_revoked" }, { status: 401 }) };
  }
  const user: ApiUser = {
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
    centreId: session.user.centreId,
    departmentId: session.user.departmentId,
    email: session.user.email ?? null,
  };
  if (!hasPermission(user.role, permission)) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}

/**
 * Authenticated session with no specific permission required.
 */
export async function requireAuth(): Promise<ApiAuthResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const versionOk = await verifySessionVersion(session.user.id, session.user.sessionVersion ?? 0);
  if (!versionOk) {
    return { ok: false, response: NextResponse.json({ error: "session_revoked" }, { status: 401 }) };
  }
  const user: ApiUser = {
    id: session.user.id,
    name: session.user.name ?? null,
    role: session.user.role,
    centreId: session.user.centreId,
    departmentId: session.user.departmentId,
    email: session.user.email ?? null,
  };
  return { ok: true, user };
}

/**
 * Pull request metadata for audit logging — IP + user agent.
 */
export function requestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent");
  return { ipAddress, userAgent };
}

/**
 * Verify the caller's active centre matches a fetched resource's centreId.
 * Use AFTER `findUnique`/`findFirst` returns a resource that has a `centreId`
 * column.
 *
 * Returns a 403 Response on mismatch (caller patterns: `if (s) return s;`),
 * or `null` when allowed.
 *
 * Bypass cases (intentional, mirrors `canSwitch` in src/lib/centre.ts):
 *   - DEV role: full cross-centre access for engineering tooling.
 *   - OWNER role: can switch centres via the header dropdown; the cookie-
 *     override in `activeCentreId()` already reflects whichever centre the
 *     owner is viewing, so this still scopes correctly to that selection.
 *
 * Resources whose `centreId` is `null` (centre-agnostic master data such as
 * Department, Service) are allowed for any authenticated user — callers who
 * want strict scoping there should not call this helper.
 *
 * Reference: audit-2026-06-06.md F-004 / F-016 / AUTHZ-013 (High; cross-centre
 * tampering reachable on a second centre).
 */
export async function assertCentreScope(
  user: ApiUser,
  resource: { centreId: string | null } | null | undefined,
): Promise<NextResponse | null> {
  if (!resource) return null; // caller handles missing resource with 404
  if (resource.centreId === null) return null; // centre-agnostic resource

  // DEV is the engineering escape hatch — keep parity with canSwitch().
  if (user.role === "DEV") return null;

  const active = await activeCentreId();
  if (active && resource.centreId === active) return null;

  return NextResponse.json({ error: "forbidden_centre_scope" }, { status: 403 });
}
