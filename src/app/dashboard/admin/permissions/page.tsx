import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PERMISSIONS,
  ROLES,
  permissionsFor,
  type Role,
  type Permission,
} from "@/lib/permissions";
import { ensurePermissionsCacheFresh } from "@/lib/permissions-cache";
import { PermissionsMatrix } from "../hierarchy/permissions-matrix";

export const dynamic = "force-dynamic";
export const metadata = { title: "Permissions — MBD Clinic OS" };

/**
 * Role × permission overrides editor. OWNER + DEV only — they alone hold the
 * `admin:manage_permissions` permission (which also gates the nav link), so an
 * ADMIN never sees a link that would bounce. The hard role check below is the
 * lockout-safe enforcement (independent of the overridable permission).
 */
export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as Role;
  if (role !== "OWNER" && role !== "DEV") redirect("/dashboard");

  await ensurePermissionsCacheFresh();
  const overrideRows = await prisma.rolePermission.findMany({
    select: { role: true, permission: true, granted: true },
  });

  const overridesMatrix: Record<Role, Record<string, boolean>> = {
    OWNER: {},
    ADMIN: {},
    FRONT_OFFICE: {},
    CONSULTANT: {},
    THERAPIST: {},
    DEV: {},
  };
  for (const r of overrideRows) {
    if (!(ROLES as readonly string[]).includes(r.role)) continue;
    overridesMatrix[r.role as Role][r.permission] = r.granted;
  }

  const defaultsMatrix: Record<Role, ReadonlyArray<string>> = {
    OWNER: permissionsFor("OWNER") as readonly string[],
    ADMIN: permissionsFor("ADMIN") as readonly string[],
    FRONT_OFFICE: permissionsFor("FRONT_OFFICE") as readonly string[],
    CONSULTANT: permissionsFor("CONSULTANT") as readonly string[],
    THERAPIST: permissionsFor("THERAPIST") as readonly string[],
    DEV: permissionsFor("DEV") as readonly string[],
  };

  // Group permissions by prefix (Patients, Appointments, Billing, Admin…).
  const PERMISSION_GROUPS: Record<string, string[]> = {};
  for (const p of PERMISSIONS as readonly Permission[]) {
    const group = p.split(":")[0] ?? "other";
    const label = group.charAt(0).toUpperCase() + group.slice(1);
    (PERMISSION_GROUPS[label] ??= []).push(p);
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="space-y-1">
        <p className="eyebrow">Admin</p>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-[color:var(--primary)]" /> Permissions
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Override the built-in role defaults per permission. Changes apply across the app within a
          few seconds (nav, page access, and API enforcement all honour overrides).
        </p>
      </header>

      <PermissionsMatrix
        roles={ROLES}
        permissions={PERMISSIONS}
        groups={PERMISSION_GROUPS}
        defaults={defaultsMatrix}
        overrides={overridesMatrix}
      />
    </div>
  );
}
