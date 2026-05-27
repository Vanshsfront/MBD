/**
 * Active-centre helpers.
 *
 * The "active centre" is the clinic an OWNER/ADMIN is currently viewing. It is
 * stored in a cookie (`activeCentreId`) that is read on every request.
 *
 * Non-OWNER/non-ADMIN staff are always pinned to their own `staff.centreId`.
 *
 * Usage (server):
 *   const centreId = await getActiveCentreId();
 *   if (centreId) where.centreId = centreId;
 */

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const ACTIVE_CENTRE_COOKIE = "activeCentreId";

/**
 * Returns the centre ID the current user should be scoped to, or null if the
 * user has no centre context (global admin view with no cookie set).
 *
 * Resolution order:
 *   1. OWNER/ADMIN: `activeCentreId` cookie wins. If unset, fall back to staff.centreId.
 *   2. Anyone else: always pinned to their staff.centreId.
 */
export async function getActiveCentreId(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return null;

  const role = user.role || "";
  const canSwitch = role === "OWNER" || role === "ADMIN" || role === "DEV";

  if (canSwitch) {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(ACTIVE_CENTRE_COOKIE)?.value;
    if (fromCookie) return fromCookie;
  }

  // Fall back to the user's own assigned clinic.
  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    select: { centreId: true },
  });
  return staff?.centreId ?? null;
}

/**
 * Returns true if the current user can switch between clinics.
 */
export async function canSwitchCentre(): Promise<boolean> {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role || "";
  return role === "OWNER" || role === "ADMIN" || role === "DEV";
}
