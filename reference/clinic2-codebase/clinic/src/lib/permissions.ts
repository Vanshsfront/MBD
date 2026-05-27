/**
 * Role-Based Access Control (RBAC) — Permissions Matrix
 *
 * Roles (ranked by privilege):
 *   OWNER       → Full access, but view-only for clinical notes
 *   ADMIN       → Admin access + doctor view
 *   CONSULTANT  → Doctor view (medical consultant)
 *   THERAPIST   → Doctor view (therapist/yoga/nutrition/massage)
 *   FRONT_OFFICE → FO view (intake, scheduling, billing)
 */

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "FRONT_OFFICE" | "CONSULTANT" | "THERAPIST" | "DEV";

export type Permission =
  | "dashboard:view"
  | "patients:view"
  | "patients:edit_demographic"
  | "patients:edit_clinical"
  | "patients:intake"
  | "patients:assign"
  | "appointments:view"
  | "appointments:edit"
  | "appointments:request_change"
  | "sessions:view"
  | "sessions:create"
  | "sessions:edit_own"
  | "consultations:view"
  | "consultations:edit_own"
  | "clinical_notes:view"
  | "clinical_notes:edit_own"
  | "clinical_notes:super_view"
  | "invoices:view"
  | "invoices:edit"
  | "payments:view"
  | "payments:edit"
  | "packages:view"
  | "packages:edit"
  | "reports:view"
  | "reports:mis"
  | "reports:export"
  | "admin:staff"
  | "admin:services"
  | "admin:settings"
  | "admin:audit"
  | "admin:flags"
  | "admin:inventory"
  | "admin:clinics"
  | "admin:referral_sources"
  | "promotions:view"
  | "promotions:edit"
  | "notifications:view"
  | "notifications:manage"
  | "change_requests:create"
  | "change_requests:review";

// All known permissions — used for the DEV role to grant blanket access.
const ALL_PERMISSIONS: Permission[] = [
  "dashboard:view",
  "patients:view", "patients:edit_demographic", "patients:edit_clinical", "patients:intake", "patients:assign",
  "appointments:view", "appointments:edit", "appointments:request_change",
  "sessions:view", "sessions:create", "sessions:edit_own",
  "consultations:view", "consultations:edit_own",
  "clinical_notes:view", "clinical_notes:edit_own", "clinical_notes:super_view",
  "invoices:view", "invoices:edit",
  "payments:view", "payments:edit",
  "packages:view", "packages:edit",
  "reports:view", "reports:mis", "reports:export",
  "admin:staff", "admin:services", "admin:settings", "admin:audit", "admin:flags", "admin:inventory",
  "admin:clinics", "admin:referral_sources",
  "promotions:view", "promotions:edit",
  "notifications:view", "notifications:manage",
  "change_requests:create", "change_requests:review",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  DEV: ALL_PERMISSIONS,
  OWNER: [
    "dashboard:view",
    "patients:view", "patients:edit_demographic", "patients:edit_clinical", "patients:intake", "patients:assign",
    "appointments:view", "appointments:edit", "appointments:request_change",
    "sessions:view", "sessions:create", "sessions:edit_own",
    "consultations:view",
    "clinical_notes:view", "clinical_notes:super_view",
    "invoices:view", "invoices:edit",
    "payments:view", "payments:edit",
    "packages:view", "packages:edit",
    "reports:view", "reports:mis", "reports:export",
    "admin:staff", "admin:services", "admin:settings", "admin:audit", "admin:flags", "admin:inventory",
    "admin:clinics", "admin:referral_sources",
    "promotions:view", "promotions:edit",
    "notifications:view", "notifications:manage",
    "change_requests:create", "change_requests:review",
  ],
  ADMIN: [
    "dashboard:view",
    "patients:view", "patients:edit_clinical",
    "appointments:view", "appointments:edit",
    "sessions:view", "sessions:create", "sessions:edit_own",
    "consultations:view", "consultations:edit_own",
    "clinical_notes:view", "clinical_notes:edit_own",
    "invoices:view",
    "payments:view",
    "packages:view",
    "reports:view", "reports:mis",
    "admin:staff", "admin:services", "admin:settings", "admin:audit", "admin:flags", "admin:inventory",
    "admin:referral_sources",
    "promotions:view", "promotions:edit",
    "notifications:view", "notifications:manage",
    "change_requests:create", "change_requests:review",
  ],
  MANAGER: [
    "dashboard:view",
    "patients:view",
    "appointments:view",
    "sessions:view",
    "consultations:view",
    "clinical_notes:view",
    "invoices:view",
    "payments:view",
    "packages:view",
    "reports:view", "reports:mis",
    "admin:audit", "admin:flags",
    "notifications:view",
  ],
  FRONT_OFFICE: [
    "dashboard:view",
    "patients:view", "patients:edit_demographic", "patients:intake", "patients:assign",
    "appointments:view", "appointments:edit",
    "sessions:view", "sessions:create",
    "consultations:view",
    "clinical_notes:view",
    "invoices:view", "invoices:edit",
    "payments:view", "payments:edit",
    "packages:view", "packages:edit",
    "admin:flags",
    "admin:inventory",
    "notifications:view", "notifications:manage",
    "change_requests:review",
  ],
  CONSULTANT: [
    "dashboard:view",
    "patients:view", "patients:edit_clinical",
    "appointments:view", "appointments:request_change",
    "sessions:view", "sessions:edit_own",
    "consultations:view", "consultations:edit_own",
    "clinical_notes:view", "clinical_notes:edit_own",
    "packages:view",
    "notifications:view",
    "change_requests:create",
  ],
  THERAPIST: [
    "dashboard:view",
    "patients:view", "patients:edit_clinical",
    "appointments:view", "appointments:request_change",
    "sessions:view", "sessions:edit_own",
    "consultations:view", "consultations:edit_own",
    "clinical_notes:view", "clinical_notes:edit_own",
    "packages:view",
    "notifications:view",
    "change_requests:create",
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Check if a role has ANY of the given permissions
 */
export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Check if a role has ALL of the given permissions
 */
export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || [];
}

/**
 * Check if a role can access a specific navigation module
 */
export function canAccessModule(role: string, module: string): boolean {
  const modulePermissions: Record<string, Permission> = {
    dashboard: "dashboard:view",
    patients: "patients:view",
    intake: "patients:intake",
    appointments: "appointments:view",
    sessions: "sessions:view",
    consultations: "consultations:view",
    invoices: "invoices:view",
    payments: "payments:view",
    packages: "packages:view",
    reports: "reports:view",
    mis: "reports:mis",
    admin: "admin:staff",
    audit: "admin:audit",
    flags: "admin:flags",
    inventory: "admin:inventory",
  };

  const perm = modulePermissions[module];
  if (!perm) return false;
  return hasPermission(role, perm);
}

/**
 * Check if a role is a clinical role (doctor/therapist/consultant)
 */
export function isClinicalRole(role: string): boolean {
  return ["THERAPIST", "CONSULTANT", "ADMIN", "OWNER", "DEV"].includes(role);
}

/**
 * Check if a role is a management role (FO/admin/owner)
 */
export function isManagementRole(role: string): boolean {
  return ["FRONT_OFFICE", "ADMIN", "MANAGER", "OWNER", "DEV"].includes(role);
}
