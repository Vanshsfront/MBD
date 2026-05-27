/**
 * Shared therapist colour palette — used on calendar, intake PDF, and dropdowns.
 * Each entry has CSS hex values for bg/border/text and Tailwind class strings for badges.
 */
export const THERAPIST_PALETTE: Array<{ bg: string; border: string; text: string; badge: string }> = [
  { bg: "#e0f2fe", border: "#38bdf8", text: "#0c4a6e", badge: "bg-sky-100 text-sky-800 border-sky-300" },
  { bg: "#fce7f3", border: "#f472b6", text: "#831843", badge: "bg-pink-100 text-pink-800 border-pink-300" },
  { bg: "#ecfccb", border: "#a3e635", text: "#365314", badge: "bg-lime-100 text-lime-800 border-lime-300" },
  { bg: "#ede9fe", border: "#a78bfa", text: "#4c1d95", badge: "bg-violet-100 text-violet-800 border-violet-300" },
  { bg: "#ffedd5", border: "#fb923c", text: "#7c2d12", badge: "bg-orange-100 text-orange-800 border-orange-300" },
  { bg: "#ccfbf1", border: "#2dd4bf", text: "#134e4a", badge: "bg-teal-100 text-teal-800 border-teal-300" },
  { bg: "#fef9c3", border: "#facc15", text: "#713f12", badge: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { bg: "#e0e7ff", border: "#818cf8", text: "#312e81", badge: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { bg: "#ffe4e6", border: "#fb7185", text: "#881337", badge: "bg-rose-100 text-rose-800 border-rose-300" },
  { bg: "#d1fae5", border: "#34d399", text: "#064e3b", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
];

/** Build a Map<staffId, PaletteEntry> from an ordered list of staff. */
export function buildTherapistColorMap(therapists: Array<{ id: string }>) {
  const map = new Map<string, typeof THERAPIST_PALETTE[0]>();
  therapists.forEach((t, i) => {
    map.set(t.id, THERAPIST_PALETTE[i % THERAPIST_PALETTE.length]);
  });
  return map;
}
