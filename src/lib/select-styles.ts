// Shared className for NATIVE form controls (<select>, <input type="date">) that
// live in server-rendered filter bars (audit / sessions / packages / MIS / reports).
// Those bars submit a real `<form method="get">`, so we keep them native (no JS) but
// style them to match the rest of the design system — i.e. the `Input` component
// (src/components/ui/input.tsx) and the Radix `SelectTrigger`
// (src/components/ui/select.tsx): rounded-lg, the token border, a card fill, and the
// same warm focus ring. Omits `w-full` so the auto-width filter layout is preserved.
export const nativeControlClass =
  "flex h-9 rounded-lg border border-[color:var(--border)] bg-card px-3 py-1 text-sm shadow-[0_1px_1px_0_var(--shadow-color)] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60";

// Radix <SelectItem> forbids an empty-string value (it throws at runtime), but
// many of our dropdowns use `<option value="">` as a real, selectable "All" /
// "— none —" choice. Use this sentinel for that item and map it back to "" in
// the onValueChange handler. (Prompt-only "Select…" placeholders don't need it —
// pass the empty value to <Select> and let <SelectValue placeholder> show.)
export const SELECT_NONE = "__none__";
