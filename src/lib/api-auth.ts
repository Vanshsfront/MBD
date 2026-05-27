// Helpers for API routes: resolve session + enforce permissions, returning
// either an error Response (for direct return) or the typed session info.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission, type Permission, type Role } from "@/lib/permissions";

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
 * Resolve the session and verify the caller has the given permission. Returns
 * a discriminated union — callers use `if (!result.ok) return result.response`.
 */
export async function requirePermission(permission: Permission): Promise<ApiAuthResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
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
