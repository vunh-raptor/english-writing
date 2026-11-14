# Flowrite design system

The app's look: **a page in a book**. White space, one centered column, hairline
rules, generous margins. The whole chrome is a single slim top bar; below it the
window belongs to the learner's material. Colour appears in exactly three
places: the one filled action on a view (the accent gradient pill), live
accents (progress, the active nav item), and the tutor's ochre notes.

It is the third look, each moved at a learner's ask: **Scriptorium** (Oxford
blue, square, flat, scholarly serif) was called old and boring; a soft violet
style with gradient panels and colour washes replaced it; that was then pared
back to this paper look — the softness kept, the decoration removed, the
sidebar folded into the top bar.

## Where it lives

| Concern | File |
| --- | --- |
| Colour, radius and shadow tokens (light + dark) | `src/app/globals.css` (`:root`, `.dark`) |
| Tailwind bindings, radius scale, shadows, fonts | `tailwind.config.ts` |
| The typeface | `src/app/layout.tsx` |
| Shared primitives (`dw-*`, `.kicker`, `.note`, `.annot-*`) | `src/app/globals.css` |
| Base components (button, card, input, badge, …) | `src/components/ui/` |
| The shell: top bar, phone tab bar | `src/components/app-nav.tsx`, `src/app/(main)/layout.tsx` |

A single `.dark` class on `<html>` (driven by `next-themes`) turns the page
near-black; everything else follows from tokens.

## The shell

- **No sidebar.** Navigation, live counts, the streak with today's progress,
  recent conversations, the theme and the account all live in one 56px top bar
  (`TopNav`); on phones the same bar plus a bottom tab bar. Chrome never takes
  width from the page.
- On large screens the window itself does not scroll: `main` is the scroll
  container with a definite height — the contract the split-pane screens
  (News missions, Transcribe) build on.
- Each page centers its own column; reading surfaces sit near `max-w-3xl`.

## Rules

- **White first.** Background and cards are the same paper; separation comes
  from hairlines (`border-border`) and spacing, with shadows barely present
  (`shadow-soft` is a 1px breath, not a lift).
- **One accent carries every interactive affordance** — token `--primary`
  (legacy names `--brand`, `--oxford`, `--sage` alias it). The one filled
  action per view is the gradient pill (`Button` default / `.dw-btn`,
  `.bg-accent-gradient` — fixed values so white text survives dark mode).
- **Ochre is for corrections and the tutor's notes only** (`--ochre`/`gold`):
  the wavy underline, the "almost" note, gentle warnings. **Never red** —
  `--destructive` exists only for genuinely destructive data actions.
- **No emoji, ever.** Lucide icons, sparingly, where text alone would hurt.
- **Rounded, not square**: cards `rounded-2xl`/`-3xl`, inputs `rounded-xl`,
  buttons/chips/toggles `rounded-full`. The scale is fixed in
  `tailwind.config.ts`.
- **Sentence case** everywhere; small uppercase labels use `.kicker`.
- **Tokens, not hex** in components (the one exception: `.bg-accent-gradient`).
- **Writing surfaces stay quiet**: no decoration inside the box someone types
  in, `spellCheck={false}` on all of them (`CLAUDE.md`).

## Type

One face: **Plus Jakarta Sans** (next/font, latin + vietnamese). Headings 700
and tight (`-0.02em`); body 16px; writing surfaces 17–18px / 1.6. `font-serif`
and `font-mono` remain as Tailwind names but resolve to the same face, so older
class strings render inside the system. Use `tabular-nums` for lined-up numbers.

## Colour

| Token | Light | Use |
| --- | --- | --- |
| `--background` / `--card` | white | the page and its sheets |
| `--primary` | violet-indigo `250 76% 58%` | every affordance |
| `--accent` / `--dw-accent-soft` | pale lavender | hover wash, active nav, your line in a conversation |
| `--dw-accent`, `--dw-accent-2`, `--dw-accent-3` | indigo, violet, sky | the gradient pill and the hero's top thread |
| `--dw-good` / `--dw-good-soft` | green | "that one's right", landed progress |
| `--ochre` / `--ochre-tint` | warm ochre | corrections, the tutor's notes |

## Shared primitives

The `dw-` prefix is historical (they began in Daily Words); any mode may use
them.

| Piece | Class |
| --- | --- |
| Surfaces | `.dw-card` (hairline sheet), `.dw-hero` (the day's title block: a white sheet with a thin accent thread on top), `.dw-glass` (blurred — the docked composer), `.dw-tile` (a tappable card) |
| Actions | `.dw-btn` (gradient pill), `.dw-btn-quiet`, `.dw-pill` (selectable chip) |
| Conversation | `.dw-bubble-them` (hairline, white), `.dw-bubble-you` (quiet accent tint, ink text), `.dw-note` (ochre) |
| Status | `.dw-chip` + `-accent` / `-good` / `-note`, `.dw-ring` (accent progress ring on paper) |
| Motion | `.dw-rise`, `.dw-pop`, `.dw-shimmer` — off under `prefers-reduced-motion` |
| Older motifs | `.kicker`, `.meta`, `.note`, `.annot-issue` (wavy ochre), `.annot-suggestion` |

## Building new UI

- Start from `src/components/ui/` or the primitives above.
- A plain card is `rounded-2xl border border-border bg-card p-6` (add
  `shadow-soft` if it floats).
- Ask of any decoration: does it help the learner read or produce? On a book
  page, almost nothing does.
