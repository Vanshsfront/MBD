# MBD Clinic OS — Design Handoff for Claude Design

Upload this file (plus the bundle listed below) to a fresh Claude Design project at **claude.ai/design**. It seeds the design system so Claude Design's output carries our visual language instead of inventing a new one.

---

## What the product is

**Movement By Design (MBD) — Clinic Operating System.** A staff-facing app for a multi-modality wellness clinic in Colaba, Mumbai. Six roles (Owner, Admin, Front Office, Consultant, Therapist, Dev). Five locked user journeys: walk-in intake → assignment → consent → calendar; returning patient → consult → package → invoice → payment; therapist daily; front-office daily; owner/admin overview + MIS.

This is **not** a marketing site. Design priorities, in order:
1. **Time-to-action for the front-office desk** — every primary action ≤ 2 clicks from the dashboard.
2. **Clinical record clarity** — long forms (80+ fields on physiotherapy consultation) must remain scannable and forgiving.
3. **Information density without clutter** — the calendar, MIS report, audit log all show many rows; tightness matters.
4. **Trust signals on money/PHI surfaces** — invoices, payments, audit log must look exact and unambiguous.

Anchor reading: `/reference/PRD.md`. The five journeys are §4. The role × permission matrix is §3.1.

---

## Visual language: "warm neumorphic"

The defining feel is **warm cream gradient + white card surfaces + hairline rings + dark-charcoal CTA + soft-pill active state**. Not iOS glassmorphism, not Material elevation. Closer to Cal.com's warmer cream variants.

**Five rules that define the language:**

1. **No pure white background, ever.** The app sits on `.bg-gradient-app` — a 3-stop warm gradient from `#fdf6f4` → `#f7f5f3` → `#f5f5f5`. Card surfaces are pure white (`#ffffff`) so they lift cleanly off the cream.
2. **Multi-layer shadow + hairline ring, never `border + shadow-sm`.** The neumorphic recipe is `0 1px 2px shadow, 0 4px 16px -6px shadow, 0 0 0 1px border-light`. Defined as `.neumorphic-card` in `globals.css`; `<Card>` applies it automatically.
3. **Three-tier text hierarchy.** `--text-primary #1a1a1e` for headings, `--text-secondary #6b6b6b` for body, `--text-tertiary #9a9a9a` for meta. Anything else is wrong.
4. **Active states are soft pills.** Sidebar active item: `bg-[color:var(--text-primary)]` (the dark charcoal) with `text-white` and a slight shadow. Tabs: 2px primary underline. Buttons: dark-charcoal CTA `.btn-primary-dark` with translucent shadow on hover/active.
5. **Inter for everything**, with `font-feature-settings: "cv11", "ss01"` enabled. Mono is Geist Mono.

---

## Design tokens (from `src/app/globals.css`)

Upload `src/app/globals.css` to the Claude Design project. The token table below is a copy for context.

### Palette (hex, warm — not oklch)

| Token | Value | Use |
|---|---|---|
| `--background` | `#f8f7f5` | Page background outside the gradient |
| `--foreground` | `#1a1a1e` | Primary text |
| `--card` | `#ffffff` | Card surfaces |
| `--primary` | `#2a7db8` | Brand blue — links, info badges, focus ring |
| `--primary-foreground` | `#ffffff` | Text on primary |
| `--secondary` | `#f5f4f2` | Subtle warm secondary surface |
| `--muted` | `#f0eeeb` | Muted surface (hover, fills) |
| `--muted-foreground` | `#6b6b6b` | Muted text |
| `--accent` | `#f5f4f2` | Hover accent |
| `--destructive` | `#dc3545` | Destructive button, danger badges |
| `--border` | `#e8e5e1` | Standard hairline |
| `--border-light` | `#f0eeeb` | Hairline ring on cards |
| `--ring` | `#2a7db8` | Focus ring |
| `--text-primary` | `#1a1a1e` | Headings + primary text |
| `--text-secondary` | `#6b6b6b` | Body |
| `--text-tertiary` | `#9a9a9a` | Meta |
| `--surface` / `--surface-elevated` | `#ffffff` | Card / modal surface |
| `--surface-secondary` | `#f5f4f2` | Inset / pill surface |
| `--shadow-color` | `rgba(26,26,30,0.05)` | Neumorphic shadow base |
| `--shadow-color-strong` | `rgba(26,26,30,0.10)` | Pressed / elevated |

### Chart palette (warm, Cal-AI inspired)

`--chart-1` `#2a7db8` · `--chart-2` `#5ba4d9` · `--chart-3` `#3d9b8f` · `--chart-4` `#e9a089` · `--chart-5` `#b8a9c9`

### Radii

`xs 6 · sm 8 · md 10 · lg 14 · xl 20 · 2xl 24` (pixels)

### Custom utilities (already defined in `globals.css`)

- `.bg-gradient-app` — the warm 3-stop gradient
- `.neumorphic-card` / `.neumorphic-card-sm` — the multi-layer shadow + hairline recipe
- `.btn-primary-dark` — dark-charcoal CTA
- `.glow-orb` — soft blurred orbs behind the login gradient
- `.stat-pill` — KPI tile surface
- `.hover-lift` / `.press-scale` — micro-interactions
- `.animate-shimmer` — skeleton loading shimmer
- `.pulse-dot` — "system online" indicator
- `.custom-scrollbar` / `.scrollbar-hide` — themed scrollbars

---

## Components in use (Radix-based)

All in `src/components/ui/`. Upload that whole folder to Claude Design.

| Primitive | Source | Notes |
|---|---|---|
| `Button` | `button.tsx` | Variants: `default` (dark), `outline`, `ghost`, `dark`, `success`, `destructive`. Sizes: `sm`, `default`, `lg`, `icon`. |
| `Card` | `card.tsx` | Applies the neumorphic recipe automatically. Use `CardHeader/Title/Description/Content/Footer`. |
| `Dialog` | `dialog.tsx` (Radix) | Modal pattern. Always include `DialogTitle` for a11y. |
| `Select` | `select.tsx` (Radix) | Stateful dropdowns. Native `<select>` only used in server-side filter forms. |
| `DropdownMenu` | `dropdown-menu.tsx` (Radix) | Header user menu pattern. |
| `Tabs` | `tabs.tsx` (Radix) | 2px primary underline on active. |
| `Tooltip` | `tooltip.tsx` (Radix) | 4–8px offset; dark surface. |
| `Popover` | `popover.tsx` (Radix) | Used by notification bell, command palette. |
| `Table` | `table.tsx` | Standard table chrome — used in MIS, audit, inventory, sessions, MisEntry rendering. |
| `Input`, `Textarea`, `Label`, `Checkbox`, `RadioGroup`, `Switch` | self-titled | Standard form primitives. Tall 11rem-ish on auth, default 9rem-ish elsewhere. |
| `Badge` | `badge.tsx` | Variants: `default`, `info`, `success`, `warning`, `danger`, `outline`. Tag-shaped, NOT rounded-full. |
| `Avatar` | `avatar.tsx` | Initials fallback uses `bg-secondary` + monogram. |
| `Progress` | `progress.tsx` | Used on packages (`completedSessions/totalSessions`). |
| `Separator` | `separator.tsx` | Horizontal hairline. |
| `Skeleton` | `skeleton.tsx` | Pairs with `loading.tsx` route segments. |
| `EmptyState` | `empty-state.tsx` | Dashed border, centered title + description + optional action. |
| `PageSkeleton` | `page-skeleton.tsx` | Loading skeleton for whole pages. |

---

## Layout chrome

Upload `src/components/layout/dashboard-shell.tsx` and `src/components/layout/nav-link.tsx` for reference. The pattern:

- **Two-column grid** at `md:` and up: `264px sidebar | 1fr main`. Mobile: sidebar hidden (`hidden md:flex`), main full width.
- **Sidebar** (`<aside>`): white surface on top of the gradient, hairline right border, branded "M" badge in a `bg-[color:var(--text-primary)]` square with subtle shadow, vertical sections (Overview / Patients / Billing / Reports / Admin / Settings), nav items as `<NavLink>` rows.
- **Active nav item**: soft dark pill — `bg-[color:var(--text-primary)] text-white shadow-[0_4px_12px_-6px_rgba(26,26,30,0.4)]`. Idle: `text-[color:var(--text-secondary)]` with `hover:bg-secondary`.
- **Top bar**: 56px tall, white-with-blur backdrop, hairline bottom border. Right cluster: SearchTrigger (Cmd+K), CentreSwitcher (Owner/Admin/DEV only), NotificationBell.
- **Content gutter**: `px-6 py-6 lg:px-10 lg:py-8`.
- **Footer of sidebar**: avatar + name + role badge + Sign out button.

---

## Existing screens worth iterating, ranked by traffic

Start at the top. These are the screens where a design improvement compounds.

1. **`/dashboard/billing/invoices/new`** — the most complex screen. Patient picker, 4 flavors (Services/Products/Manual/Proforma), 3-tab line picker (Recent/All/Products), Duo/Trio quantity lock, discount + promo, real-time totals. Mobile is mostly unused here.
2. **`/dashboard/patients/[id]/clinical`** — long forms (80+ fields on physiotherapy consultation). Autosave indicator, draft/lock buttons, recommended-sessions widget, inventory-usage widget. Needs a section-nav-within-form pattern.
3. **`/dashboard/calendar`** — FullCalendar embed. Drag-to-create, drag-to-reschedule. Validation errors today are toasts after the fact. Worth: inline conflict overlays, working-hours dim.
4. **`/dashboard/assign`** — assignment queue. Multi-therapist picker, primary marker, consent capture (digital pad OR scan upload). Worth: clearer step pattern.
5. **`/dashboard/patients/[id]`** — patient detail overview. Sticky patient header is missing — flags/allergies/key vitals should ride across all sub-tabs (Epic/Athena pattern).
6. **`/dashboard/reports/mis`** — 31-column table. Needs robust filtering chrome + export affordance.
7. **`/dashboard/intake`** + **`/intake/[token]`** — QR generator on staff side, mobile patient form on token side. Mobile is the dominant surface for `/intake/[token]`.
8. **`/login`** — first impression. Already polished but consider conveying "secure clinic system" cues (lock affordances, brand mark).

---

## Screenshots to capture and upload

Run `npm run dev` and capture at two viewports — desktop **1440 × 900** and mobile **375 × 812** — for each of the eight screens above. Naming convention: `{slug}-{viewport}.png`, e.g. `invoice-new-desktop.png`, `intake-token-mobile.png`. Drop them all into the Claude Design project.

Demo Patient is `COL-MBD-DEMO` — finds easily in the patients list. Use the seeded credentials in `HANDOFF.md` (Owner: `marazban@mbd.in` / `mbd2026`).

---

## Out of scope for design iteration tonight

- Public marketing site
- Patient-facing app beyond `/intake/[token]` and `/portal/[token]` (read-only)
- DocuSign / e-signature surfaces (Phase 2)
- Anything Razorpay/WhatsApp/SMS integration-flavoured (Phase 2)

---

## Handoff loop back into the codebase

When you've iterated on a screen in Claude Design and you're happy:

1. Export the **handoff bundle** from Claude Design.
2. Open a new Claude Code session in this repo.
3. Paste the bundle URL / unzipped content with: *"Implement this for [screen / component name]."*
4. I (Claude Code) will diff the proposal against the existing component, plan a focused change, run the smoke gate, and commit.

Keep one bundle = one focused commit. Big multi-screen redesigns are easier to ship in series than in a single megachange.
