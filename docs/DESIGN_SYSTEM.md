# Flowrite design system

The app's look: **soft and bright**. A violet-indigo accent, rounded surfaces
lifted on soft shadow, one modern sans, and a faint wash of colour behind every
page. It is meant to feel like a current consumer app — calm, friendly, a little
playful — rather than a document.

It replaced **Scriptorium** (Oxford blue, square corners, flat surfaces, a
Newsreader serif over IBM Plex Mono metadata) after a learner called that look
old and boring. The new style was piloted in Daily Words first, then applied to
every mode.

## Where it lives

| Concern | File |
| --- | --- |
| Colour, radius and shadow tokens (light + dark) | `src/app/globals.css` (`:root`, `.dark`) |
| Tailwind bindings, radius scale, shadows, fonts | `tailwind.config.ts` |
| The typeface | `src/app/layout.tsx` |
| Shared primitives (`dw-*`, `.kicker`, `.note`, `.annot-*`, `.app-mesh`) | `src/app/globals.css` |
| Base components (button, card, input, badge, …) | `src/components/ui/` |

A single `.dark` class on `<html>` (driven by `next-themes`) repaints the app.

## Rules

- **One accent carries every interactive affordance**: buttons, links, focus
  rings, the active nav item, selection. Token: `--primary` (the legacy names
  `--brand`, `--oxford`, `--sage` alias it, so older class strings followed).
- **Ochre is for corrections and the tutor's notes only** — the wavy underline,
  the "almost" note in Daily Words, gentle warnings. Token: `--ochre` / `gold`.
- **Never red.** Correction reads as a tutor's pencil, not a red pen.
  `--destructive` exists only for genuinely destructive data actions ("Erase
  everything").
- **No emoji, ever.** Icons are Lucide at their default stroke, used sparingly
  where text alone would hurt usability.
- **Rounded, not square.** Cards `rounded-2xl`/`rounded-3xl`, inputs
  `rounded-xl`, buttons, chips and toggles `rounded-full`. The radius scale is
  fixed in `tailwind.config.ts` so the same class means the same curve
  everywhere.
- **Lifted, not flat.** White cards sit on `shadow-soft`; floating things
  (menus, the docked composer) get `shadow-lg` or the glass treatment.
- **One filled action per view** — the gradient pill (`Button` default
  variant, or `.dw-btn`). Everything else is `secondary`, `outline` or `ghost`.
- **Sentence case** everywhere. Small uppercase labels use `.kicker`.
- **Tokens, not hex.** Components never carry raw colours; the one exception is
  `.bg-accent-gradient`, which is fixed on purpose (below).
- **Writing surfaces stay quiet.** No decoration inside the box someone types
  in, and `spellCheck={false}` on every one of them (`CLAUDE.md`).

## Type

One face: **Plus Jakarta Sans**, self-hosted through `next/font` with the
Vietnamese subset. Headings are 700, tight (`-0.02em`); body text 16px; the
writing surfaces 17–18px with 1.6 line height.

`font-serif` and `font-mono` are kept as Tailwind names but point at the same
face, so an older class string renders inside the system instead of as a stray
voice. Use `tabular-nums` where numbers line up.

## Colour

| Token | Light | Use |
| --- | --- | --- |
| `--primary` | violet-indigo `250 76% 58%` | every affordance |
| `--accent` / `--dw-accent-soft` | pale lavender | hover wash, active nav, soft fills |
| `--dw-accent`, `--dw-accent-2`, `--dw-accent-3` | indigo, violet, sky | gradients and the background wash |
| `--dw-good` / `--dw-good-soft` | green | "that one's right", landed progress |
| `--ochre` / `--ochre-tint` | warm ochre | corrections, the tutor's notes |
| `--background` | `#F8F8FC` | the page |
| `--card` | white | surfaces |

Dark mode lightens the accent and deepens the surfaces. Because the accent
lightens, **gradients do not use the theme tokens**: `.bg-accent-gradient` is a
fixed indigo-to-violet pair, so white text on it stays readable in both themes.

## Shared primitives

They began as the Daily Words pilot, hence the `dw-` prefix; any mode may use
them.

| Piece | Class |
| --- | --- |
| Surfaces | `.dw-card` (rounded, soft shadow), `.dw-hero` (gradient panel), `.dw-glass` (blurred — the docked composer), `.dw-tile` (a tappable card) |
| Actions | `.dw-btn` (gradient pill), `.dw-btn-onhero` (white pill on a gradient), `.dw-btn-quiet`, `.dw-pill` (a selectable chip) |
| Conversation | `.dw-bubble-them`, `.dw-bubble-you`, `.dw-note` (ochre) |
| Status | `.dw-chip` + `-accent` / `-good` / `-note`, `.dw-ring` (progress ring) |
| Motion | `.dw-rise`, `.dw-pop`, `.dw-shimmer` — all off under `prefers-reduced-motion` |
| Atmosphere | `.app-mesh` (fixed, behind every page in the main layout) |
| Fill | `.bg-accent-gradient` |
| Older motifs, restyled | `.kicker`, `.meta`, `.note`, `.annot-issue` (wavy ochre), `.annot-suggestion` |

## Building new UI

- Start from `src/components/ui/` (`Button`, `Card`, `Input`, `Badge`) or the
  primitives above before writing classes by hand.
- Prefer `bg-card rounded-2xl shadow-soft p-6` for a plain card.
- Keep motion short and purposeful: a rise-in for new content, a pop for a
  success mark, nothing that loops except loading.
