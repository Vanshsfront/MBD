// Active centre resolution.
//
// Default: session.user.centreId (set at login from Staff.centreId).
// Override: a `mbd-centre` cookie set via /api/centre-switch. Only honoured
// if the caller has admin:manage_clinics OR is DEV — otherwise we ignore
// the cookie. This mirrors PRD §6.10: only Owner/Admin can switch active
// centre via the header dropdown.

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPermission, type Role } from "@/lib/permissions";

const COOKIE_NAME = "mbd-centre";

/**
 * Server-side: returns the centre id the caller should see right now.
 * Use inside Server Components and API routes that scope queries by centre.
 */
export async function activeCentreId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  const role = session.user.role as Role;

  if (canSwitch(role)) {
    const jar = await cookies();
    const override = jar.get(COOKIE_NAME)?.value;
    if (override) return override;
  }
  return session.user.centreId ?? null;
}

export function canSwitch(role: Role): boolean {
  return hasPermission(role, "admin:manage_clinics") || role === "DEV";
}

export const CENTRE_COOKIE = COOKIE_NAME;
