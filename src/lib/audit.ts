// MBD Clinic OS — Audit log helper (PRD §6.8)
//
// Centralised mutation logger. Every CREATE/UPDATE/DELETE on Client, Invoice,
// Payment, Session, Consultation, Package, Staff, Service, Promotion goes
// through this. Silent-fail: audit logging never breaks the main mutation.

import { prisma } from "@/lib/prisma";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "EXPORT";

export type AuditEntity =
  | "Client"
  | "Invoice"
  | "Payment"
  | "Session"
  | "Consultation"
  | "Package"
  | "Staff"
  | "Service"
  | "Promotion"
  | "Centre"
  | "IntakeToken"
  | "IntakeForm"
  | "ClientDoctorAssignment"
  | "Appointment"
  | "InventoryItem"
  | "InventoryLog"
  | "ChangeRequest"
  | "ClientFlag"
  | "ReferralSource"
  | "Department"
  | "AttendanceLog"
  | "Auth";

export type AuditChangeMap = Record<string, { old: unknown; new: unknown }>;

export interface AuditLogParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  performedById: string;
  changes?: AuditChangeMap;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const SKIP_FIELDS = new Set<string>([
  "id",
  "createdAt",
  "updatedAt",
  "passwordHash",
  // Large JSON blobs that bloat the audit log
  "lineItems",
  "formData",
  "serviceMix",
  "allotments",
  "inventoryUsage",
  "metadata",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return false;
}

/**
 * Compute a per-field diff between two records. Skips system fields and
 * large JSON blobs. Returns `undefined` when no fields changed.
 */
export function computeChanges(
  oldObj: Record<string, unknown> | null | undefined,
  newObj: Record<string, unknown>,
  fields?: readonly string[],
): AuditChangeMap | undefined {
  const keys = fields ?? Object.keys(newObj);
  const out: AuditChangeMap = {};

  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) continue;
    const oldValue = oldObj ? oldObj[key] : undefined;
    const newValue = newObj[key];
    if (isPlainObject(newValue) || Array.isArray(newValue)) {
      // Compare via JSON for deep-ish equality without explicit walk.
      const oldJson = JSON.stringify(oldValue ?? null);
      const newJson = JSON.stringify(newValue ?? null);
      if (oldJson !== newJson) {
        out[key] = { old: oldValue ?? null, new: newValue };
      }
      continue;
    }
    if (!shallowEqual(oldValue, newValue)) {
      out[key] = { old: oldValue ?? null, new: newValue };
    }
  }

  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * Persist an audit log row. Errors are swallowed and logged to console so
 * audit failures never abort the main mutation.
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        performedById: params.performedById,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    console.warn("[audit] failed to write audit log", err);
  }
}
