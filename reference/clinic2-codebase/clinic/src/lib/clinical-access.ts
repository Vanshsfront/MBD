import { prisma } from "./prisma";

/**
 * Clinical-record edit gate.
 *
 * Rules:
 * - OWNER: unrestricted — can always edit, including backdated records.
 * - ADMIN / MANAGER / FRONT_OFFICE: bypass the backdate lock but still subject to any
 *   existing record-level `isLocked` flags (consultations).
 * - THERAPIST / CONSULTANT: can only edit records for clients they are actively assigned
 *   to via `ClientDoctorAssignment`. Once a record reaches COMPLETED, edits are locked
 *   for them (append-only via new records is fine). See meeting decision 2026-04-17:
 *   "you cannot change what you have already put in" — hard lock on save.
 *
 * The caller passes `recordStatus` and `recordUpdatedAt` so a single helper works
 * for both sessions and consultations.
 */
export interface ClinicalAccessInput {
  userId: string;
  userRole: string;
  clientId: string;
  recordStatus?: string | null;
  recordUpdatedAt?: Date | null;
}

export interface ClinicalAccessResult {
  allowed: boolean;
  reason?: string;
}

export async function canEditClinicalRecord(
  input: ClinicalAccessInput
): Promise<ClinicalAccessResult> {
  const { userId, userRole, clientId, recordStatus } = input;

  if (!userId) {
    return { allowed: false, reason: "Not authenticated" };
  }

  // OWNER / DEV always allowed
  if (userRole === "OWNER" || userRole === "DEV") return { allowed: true };

  const isClinical = userRole === "THERAPIST" || userRole === "CONSULTANT";

  // Therapist/consultant: require an active assignment
  if (isClinical) {
    const assignment = await prisma.clientDoctorAssignment.findUnique({
      where: { clientId_staffId: { clientId, staffId: userId } },
    });
    if (!assignment || assignment.endedAt) {
      return { allowed: false, reason: "You are not assigned to this patient" };
    }

    // Hard-lock on COMPLETED for non-OWNER clinical staff
    if (recordStatus === "COMPLETED") {
      return {
        allowed: false,
        reason:
          "This record is locked because it has been completed. Only the clinic owner can edit it. Add a new entry instead.",
      };
    }
  }

  return { allowed: true };
}
