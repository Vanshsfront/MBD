// Friendly error-message mapper. Every API route in the codebase returns
// `{ error: "snake_case_code", ...detail }` on non-2xx responses. Client
// components used to surface the raw code directly in a toast — e.g.
// "no_intake_form" or "clash". This mapper turns those into human copy that
// the FO/therapist can actually act on, and interpolates any structured
// detail the API also returns (productName, available, conflicting staff,
// etc.).
//
// Usage in client components:
//   try {
//     const res = await fetch(...);
//     if (!res.ok) throw new Error(await readApiError(res, { fallback: "Couldn't save consent." }));
//     ...
//   } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
//
// One source of truth — when the API gains a new error code, add it here and
// every page that uses readApiError automatically renders the friendly copy.

type ZodIssue = { path?: Array<string | number>; message?: string };

export interface ApiErrorPayload {
  error?: string;
  issues?: ZodIssue[];
  productName?: string;
  available?: number;
  requested?: number;
  conflictingStaffName?: string;
  conflictingStart?: string;
  conflictingEnd?: string;
  appointmentLabel?: string;
  assignmentLabel?: string;
  detail?: string;
  // Allow arbitrary detail without losing type safety on the well-known keys.
  [k: string]: unknown;
}

export interface MapOpts {
  fallback?: string;
}

// Per-code factory: takes the payload and returns the user-facing string.
// Plain string entries are static; functions receive the full payload so
// they can interpolate structured detail the route surfaces.
type MessageFactory = string | ((p: ApiErrorPayload) => string);

const MESSAGES: Record<string, MessageFactory> = {
  // Generic / shared
  not_found: "We couldn't find that record. It may have been removed.",
  forbidden: "You don't have permission to do this.",
  validation_failed: (p) =>
    p.issues && p.issues.length > 0
      ? `Please check: ${summariseIssues(p.issues)}.`
      : "Some required fields are missing or invalid.",
  payload_invalid: "The request data wasn't in the expected shape.",
  parse_failed: "We couldn't read the uploaded file. Try a different format.",
  expected_multipart: "Upload a file using the file picker — direct JSON isn't supported.",
  file_required: "Please select a file to upload.",
  file_too_large: "That file is too large. Use one under 4 MB.",
  signature_too_large: "The signature image is too large. Have the patient sign again.",
  unknown_template: "That clinical template isn't recognised.",
  no_active_centre: "Select a centre before continuing.",
  centre_not_found: "That centre doesn't exist.",
  no_services_found: "No matching services found.",
  locked: "This record is locked and can't be edited.",

  // Auth / sessions
  invalid_token: "This link is invalid.",
  expired: "This link has expired. Ask the front office for a fresh one.",
  revoked: "This link was revoked. Ask the front office for a fresh one.",
  wrong_password: "Current password is incorrect.",

  // Patient / intake / consent
  client_not_found: "Patient not found.",
  client_or_centre_missing: "Patient or centre is missing.",
  client_has_no_centre: "This patient isn't linked to a centre.",
  client_mismatch: "This action targets a different patient than expected.",
  no_intake_form:
    "This patient hasn't filled out the intake form yet — capture it from the assignment queue before saving consent.",
  not_assigned: "You're not assigned to this patient.",

  // Assignment
  already_assigned: "This patient is already assigned to a therapist.",
  assignment_not_found: "Assignment not found.",
  assignment_not_yours: "You don't own this assignment.",
  assignment_gone: "The original assignment was removed before this could be approved.",
  assignment_already_ended: "This assignment was already ended.",

  // Appointments
  appointment_not_found: "Appointment not found.",
  appointment_not_yours: "You don't own this appointment.",
  appointment_gone: "The original appointment was deleted before this could be approved.",
  appointment_locked: "This appointment has been completed or cancelled and can't be moved.",
  clash: (p) =>
    p.conflictingStaffName
      ? `${p.conflictingStaffName} is already booked${formatWindow(p.conflictingStart, p.conflictingEnd)}.`
      : "Another appointment already covers that slot.",
  end_before_start: "End time must be after the start time.",

  // Consultations / clinical
  consultation_not_found: "Consultation not found.",
  consultation_not_yours: "You can only edit your own consultations.",
  consultation_or_session_required: "Link this to a consultation or session first.",
  form_data_invalid: (p) =>
    p.issues && p.issues.length > 0
      ? `Form has issues: ${summariseIssues(p.issues)}.`
      : "Some clinical-record fields aren't filled correctly.",
  not_author: "Only the original author can edit this record.",

  // Sessions
  session_not_found: "Session not found.",
  session_not_yours: "You don't own this session.",
  already_logged_today: "Already logged for today.",

  // Inventory
  inventory_item_not_found: "Inventory item not found.",
  product_not_in_centre_inventory: (p) =>
    p.productName
      ? `${p.productName} isn't in this centre's inventory. Stock it in first.`
      : "One of the products isn't stocked at this centre yet.",
  insufficient_stock: (p) =>
    p.productName && typeof p.available === "number" && typeof p.requested === "number"
      ? `${p.productName} — only ${p.available} in stock, ${p.requested} requested.`
      : "Not enough stock for one of the items.",
  would_go_negative: "That change would drop stock below zero.",

  // Invoices / payments
  invoice_not_found: "Invoice not found.",
  invoice_cancelled: "This invoice was cancelled — no further payments can be recorded.",
  service_not_found: "Service not found.",

  // Admin / data
  code_taken: "That code is already in use.",
  name_taken: "That name is already in use.",
  slug_taken: "That slug is already in use.",
  cannot_deactivate_owner: "The owner account can't be deactivated.",
  new_staff_invalid: "New staff member isn't valid for this reassignment.",

  // Change requests
  already_reviewed: "This change request has already been reviewed.",
};

function formatWindow(start: unknown, end: unknown): string {
  if (typeof start !== "string" || typeof end !== "string") return "";
  try {
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
    const dayFmt = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" });
    return ` ${dayFmt.format(s)}–${timeFmt.format(e)}`;
  } catch {
    return "";
  }
}

function summariseIssues(issues: ZodIssue[]): string {
  const labels = issues
    .slice(0, 4)
    .map((i) => {
      const path = (i.path ?? []).filter((p) => typeof p === "string" || typeof p === "number");
      const dotted = path.join(".");
      return dotted || i.message || "field";
    })
    .filter(Boolean);
  return labels.join(", ");
}

export function mapApiError(payload: ApiErrorPayload | null | undefined, opts: MapOpts = {}): string {
  const fallback = opts.fallback ?? "Something went wrong. Please try again.";
  const code = payload?.error;
  if (!code) return fallback;
  const entry = MESSAGES[code];
  if (typeof entry === "function") return entry(payload!);
  if (typeof entry === "string") return entry;
  // Unknown code — surface the fallback and hint the code for the support log,
  // but keep it readable instead of dumping snake_case at the user.
  return `${fallback} (${humanise(code)})`;
}

function humanise(code: string): string {
  return code.replace(/_/g, " ");
}

export async function readApiError(res: Response, opts: MapOpts = {}): Promise<string> {
  const payload = await res.json().catch(() => null);
  return mapApiError(payload as ApiErrorPayload | null, opts);
}
