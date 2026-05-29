// Appointment timing validation (PRD §6 punchlist #9). Shared by the booking
// + reschedule paths so the calendar and the API enforce the same rules:
//   - end strictly after start
//   - not in the past
//   - within clinic working hours (default 08:00-20:00, configurable per env)
// The ±15-minute patient-adjacency check is a WARNING, surfaced separately
// (it never blocks).
//
// DEV BYPASS: set DEV_BYPASS_APPT_GUARDS=true in .env.local to skip the
// past-time + working-hours checks. Refuses to engage in production
// (NODE_ENV === "production") so it can't accidentally ship live. Use it
// when demoing or QAing odd-hour flows.

export const CLINIC_TZ_OFFSET_MINUTES = Number(process.env.CLINIC_TZ_OFFSET_MINUTES ?? 330); // IST
export const CLINIC_OPEN_HOUR = Number(process.env.CLINIC_OPEN_HOUR ?? 8);
export const CLINIC_CLOSE_HOUR = Number(process.env.CLINIC_CLOSE_HOUR ?? 20);

const DEV_BYPASS =
  process.env.NODE_ENV !== "production" &&
  process.env.DEV_BYPASS_APPT_GUARDS === "true";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function clinicHoursLabel(): string {
  return `${pad2(CLINIC_OPEN_HOUR)}:00–${pad2(CLINIC_CLOSE_HOUR)}:00`;
}

// Hour-of-day (with fractional minutes) in the clinic's local timezone.
function clinicLocalHour(d: Date): number {
  const shifted = new Date(d.getTime() + CLINIC_TZ_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
}

export interface TimingResult {
  error?: "end_before_start" | "in_the_past" | "outside_working_hours";
  windowLabel?: string;
}

/**
 * Validate a proposed appointment window. Returns `{}` when valid, else an
 * `{ error }` code (and `windowLabel` for working-hours messages).
 */
export function validateAppointmentTiming(start: Date, end: Date, now: Date = new Date()): TimingResult {
  if (!(end.getTime() > start.getTime())) return { error: "end_before_start" };
  // Dev bypass intentionally still rejects end-before-start (data integrity)
  // but skips the past-time + working-hours checks so odd-hour demos work.
  if (DEV_BYPASS) return {};
  // 60s grace so "now" bookings aren't rejected by clock skew.
  if (start.getTime() < now.getTime() - 60_000) return { error: "in_the_past" };
  const startHour = clinicLocalHour(start);
  const endHour = clinicLocalHour(end);
  if (startHour < CLINIC_OPEN_HOUR || endHour > CLINIC_CLOSE_HOUR || endHour < startHour) {
    return { error: "outside_working_hours", windowLabel: clinicHoursLabel() };
  }
  return {};
}

export function devBypassActive(): boolean {
  return DEV_BYPASS;
}

export const ADJACENCY_WINDOW_MINUTES = 15;
