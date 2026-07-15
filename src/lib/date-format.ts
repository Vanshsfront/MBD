export const CLINIC_TIME_ZONE = "Asia/Kolkata";

export function formatClinicDateTime(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    ...options,
  });
}

export function formatClinicDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    ...options,
  });
}

export function formatClinicTime(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Date(date).toLocaleTimeString("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    ...options,
  });
}
