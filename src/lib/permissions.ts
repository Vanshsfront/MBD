// MBD Clinic OS — Role × permission matrix (PRD §3.1)
// Used by API handlers (hasPermission) and nav whitelist (canAccessRoute).

export const ROLES = [
  "OWNER",
  "ADMIN",
  "FRONT_OFFICE",
  "CONSULTANT",
  "THERAPIST",
  "DEV",
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Dashboard
  "dashboard:view",

  // Patients
  "patients:generate_intake_qr",
  "patients:view_all",
  "patients:view_assigned",
  "patients:edit_demographics",
  "patients:assign_therapist",
  "patients:edit_clinical_record_own",
  "patients:view_all_clinical_records",
  "patients:edit_completed_clinical_record", // OWNER-only override

  // Appointments
  "appointments:view_calendar_all",
  "appointments:book_reschedule_cancel",
  "appointments:request_change",
  "appointments:review_change_request",

  // Billing
  "billing:view_invoices",
  "billing:create_edit_invoice",
  "billing:view_payments",
  "billing:record_payment",
  "billing:view_packages",
  "billing:edit_packages",

  // Reports
  "reports:view",
  "reports:mis",
  "reports:export_csv",

  // Admin
  "admin:manage_staff",
  "admin:manage_clinics",
  "admin:manage_services",
  "admin:manage_products",
  "admin:manage_promotions",
  "admin:manage_referral_sources",
  "admin:audit_log",
  "admin:client_flags",
  "admin:attendance",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const OWNER_PERMS: readonly Permission[] = ALL_PERMISSIONS;

const ADMIN_PERMS: readonly Permission[] = [
  "dashboard:view",
  "patients:view_all",
  "patients:view_assigned",
  "patients:edit_clinical_record_own",
  "patients:view_all_clinical_records",
  "appointments:view_calendar_all",
  "appointments:book_reschedule_cancel",
  "appointments:review_change_request",
  "billing:view_invoices",
  "billing:view_payments",
  "billing:view_packages",
  "reports:view",
  "reports:mis",
  "admin:manage_staff",
  "admin:manage_services",
  "admin:manage_products",
  "admin:manage_referral_sources",
  "admin:audit_log",
  "admin:client_flags",
  "admin:attendance",
];

const FO_PERMS: readonly Permission[] = [
  "dashboard:view",
  "patients:generate_intake_qr",
  "patients:view_all",
  "patients:view_assigned",
  "patients:edit_demographics",
  "patients:assign_therapist",
  "appointments:view_calendar_all",
  "appointments:book_reschedule_cancel",
  "appointments:review_change_request",
  "billing:view_invoices",
  "billing:create_edit_invoice",
  "billing:view_payments",
  "billing:record_payment",
  "billing:view_packages",
  "billing:edit_packages",
  "admin:manage_products",
  "admin:client_flags",
];

const CONSULTANT_PERMS: readonly Permission[] = [
  "dashboard:view",
  "patients:view_assigned",
  "patients:edit_clinical_record_own",
  "appointments:view_calendar_all",
  "appointments:request_change",
  "billing:view_packages",
];

const THERAPIST_PERMS: readonly Permission[] = [
  "dashboard:view",
  "patients:view_assigned",
  "patients:edit_clinical_record_own",
  "appointments:view_calendar_all",
  "appointments:request_change",
  // No billing:view_packages — therapists see only a session-count chip on
  // the patient detail page; FO handles package details/creation/pricing.
  // Therapists post free-text suggestions via /api/package-suggestions
  // instead.
];

const DEV_PERMS: readonly Permission[] = ALL_PERMISSIONS;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: OWNER_PERMS,
  ADMIN: ADMIN_PERMS,
  FRONT_OFFICE: FO_PERMS,
  CONSULTANT: CONSULTANT_PERMS,
  THERAPIST: THERAPIST_PERMS,
  DEV: DEV_PERMS,
};

// DB-backed overrides on top of ROLE_PERMISSIONS. The cache is populated
// by `ensurePermissionsCacheFresh()` in src/lib/permissions-cache.ts
// (server-only — imports prisma). This file stays sync + client-safe so
// it can be imported from both server and client components.
//
// Cold-boot before the first refresh → defaults apply, which is the right
// safe-default. The editor's POST handler calls invalidatePermissionsCache
// to force a re-read on the next request.
type OverrideKey = string; // `${role}:${permission}`
let permissionOverrides: { map: Map<OverrideKey, boolean>; loadedAt: number } | null = null;

/** Internal — called by permissions-cache.ts after a DB read completes. */
export function _setPermissionOverrides(rows: ReadonlyArray<{ role: string; permission: string; granted: boolean }>): void {
  const map = new Map<OverrideKey, boolean>();
  for (const r of rows) map.set(`${r.role}:${r.permission}`, r.granted);
  permissionOverrides = { map, loadedAt: Date.now() };
}

/** Internal — for the cache helper to check whether a refresh is due. */
export function _permissionOverrideLoadedAt(): number | null {
  return permissionOverrides?.loadedAt ?? null;
}

export function invalidatePermissionsCache(): void {
  permissionOverrides = null;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  if (permissionOverrides) {
    const o = permissionOverrides.map.get(`${role}:${permission}`);
    if (o !== undefined) return o;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function isClinicalRole(role: Role): boolean {
  return role === "CONSULTANT" || role === "THERAPIST";
}

export function isManagementRole(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
