// Staff calendar colours.
//
// Every therapist/staff member needs a visually distinct colour on the
// calendar. Admins can set an explicit colour per person (Staff.color); when
// none is set we derive a stable colour from the staff id so the calendar is
// never monochrome and a given person always renders the same hue.

// Curated palette — distinct hues, mid saturation so white/near-black text
// both stay legible after we pick a contrasting foreground. Order matters:
// the deterministic fallback walks this list, so adjacent staff get
// well-separated colours.
export const STAFF_COLOR_PALETTE: readonly string[] = [
  "#2a7db8", // blue (matches --primary family)
  "#e0533d", // coral red
  "#2f9e6e", // green
  "#9b59b6", // purple
  "#e08a1e", // amber
  "#1f9bb8", // teal
  "#d6447f", // pink
  "#6b7fd6", // indigo
  "#7a9b2f", // olive
  "#c2632f", // burnt orange
  "#4a8fb0", // slate blue
  "#8e44ad", // violet
] as const;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

// Small, stable string hash (djb2). Deterministic across server/client so the
// fallback colour matches everywhere the same id is rendered.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Resolve a staff member's calendar colour. Uses the explicit override when it
 * is a valid hex, otherwise a deterministic palette colour derived from the id.
 */
export function staffColor(id: string, override?: string | null): string {
  if (isValidHexColor(override)) return override.trim();
  return STAFF_COLOR_PALETTE[hashString(id) % STAFF_COLOR_PALETTE.length];
}

function expandHex(hex: string): string {
  const h = hex.trim().replace("#", "");
  if (h.length === 3) return h.split("").map((c) => c + c).join("");
  return h;
}

/**
 * Pick a foreground colour (near-black or white) that stays legible on top of
 * the given background, using the WCAG relative-luminance threshold.
 */
export function readableTextColor(bgHex: string): string {
  if (!isValidHexColor(bgHex)) return "#ffffff";
  const h = expandHex(bgHex);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#1a1a1e" : "#ffffff";
}
