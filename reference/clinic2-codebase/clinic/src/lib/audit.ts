import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

interface AuditLogParams {
  action: AuditAction;
  entity: string;
  entityId: string;
  performedById?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

// Fields to skip when auto-diffing
const SKIP_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "passwordHash",
  "performedById", // internal audit param, not a real field
]);

/**
 * Get the current logged-in user's ID from the server-side NextAuth session.
 * Falls back to undefined if no session exists (e.g. public endpoints).
 */
export async function getSessionUserId(): Promise<string | undefined> {
  try {
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session?.user as any)?.id || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Create an audit log entry tracking who modified data.
 * Resolves performedById from: explicit param → server session → "SYSTEM".
 */
export async function createAuditLog(params: AuditLogParams) {
  try {
    let userId = params.performedById;
    if (!userId) {
      userId = await getSessionUserId();
    }
    if (!userId) {
      // Cannot create audit log without a performer — log warning but don't fail
      console.warn("[AuditLog] No performedById available, skipping audit log for", params.entity, params.entityId);
      return;
    }

    await prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        performedById: userId,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    // Don't let audit logging failures break the main operation
    console.error("[AuditLog] Failed to create audit log:", error);
  }
}

/**
 * Auto-detect all field-level changes between old and new objects.
 * No hardcoded field list — compares every key present in either object,
 * skipping internal fields like id, timestamps, and passwordHash.
 */
export function computeChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields?: string[]
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  // If specific fields provided, use them; otherwise auto-detect from newObj keys
  const keysToCheck = fields || Object.keys(newObj);

  for (const field of keysToCheck) {
    if (SKIP_FIELDS.has(field)) continue;

    const oldVal = oldObj[field];
    const newVal = newObj[field];

    // Skip if newVal is undefined (field wasn't sent in the update)
    if (newVal === undefined) continue;

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
