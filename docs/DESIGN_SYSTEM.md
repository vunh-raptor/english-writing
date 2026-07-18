# Scriptorium Design System

Flowrite's UI follows **Scriptorium**, an academic-writing design system imported
from the team's Claude Design project ("Scriptorium Design System"). This doc is
the local source of truth for how the system is wired into the app and how to
build on-brand UI.

> Vibe in one line: a scholarly journal, not a classroom app — Oxford-blue
> authority, ochre pencil annotations, cool paper neutrals, serif gravitas
> (Newsreader) over a crisp sans writing surface (Source Sans 3).

## Where it lives

| Concern | File |
| --- | --- |
| Color / radius / shadow tokens (light + dark) | `src/app/globals.css` |
| Tailwind token bindings, fonts, square radius scale | `tailwind.config.ts` |
| Fonts (Newsreader, Source Sans 3, IBM Plex Mono) | `src/app/layout.tsx` |
| Signature motif helpers (`.kicker`, `.meta`, `.annot-*`) | `src/app/globals.css` |

The palette is expressed as shadcn HSL tokens, so a single `.dark` class on
`<html>` (driven by `next-themes`) repaints the whole app between **paper**
(light) and **lamplight** (dark).

## Non-negotiables

- **Oxford blue `#2E4E7E`** carries every interactive affordance — buttons,
  links, focus rings, active nav, selection. Token: `--primary` / `--brand` /
  `oxford`.
- **Ochre `#8A6A24`** is reserved **exclusively** for grammar annotations.
  Never use it for interactive UI. Token: `--ochre` / `ochre` / `gold`.
- **Never red.** Scriptorium reads correction as a tutor's pencil (ochre), not a
  red pen. `--destructive` exists only as a restrained, muted last resort for
  genuinely destructive data actions (e.g. "Erase everything").
- **No emoji, ever.** Typographic marks do the work: middle dots (·) separate
  metadata, en/em dashes, `✓`/`→` glyphs, real curly quotes. Uppercase mono
  kickers (`.kicker`) label sections.
- **No icons as a rule.** Lucide is kept as a flagged substitution (thin 1.5px
  stroke, slate) for nav/affordances where text alone would hurt usability.
- **Square everything.** `--radius: 0px`; the Tailwind radius scale is overridden
  so every `rounded-*` is `0` except `rounded-full` (kept for genuine circles:
  spinners, dots, the switch thumb).
- **Flat surfaces.** Separation comes from background contrast (canvas → paper →
  sheet) plus hairline borders. `shadow-soft` is neutralized to `none`; `shadow`
  is reserved for genuinely floating overlays and the app frame.
- **Sentence case** everywhere except mono kickers, which are UPPERCASE.

## Type

Three self-hosted typefaces (via `next/font`), wired to CSS variables:

- `--font-serif` → **Newsreader** — headings, the wordmark, document titles,
  empty-state prose. Tailwind: `font-serif`. Headings default to weight 500.
- `--font-sans` → **Source Sans 3** — the writing surface and every UI control.
  Tailwind: `font-sans` (the body default). Editor prose is ~18px / 1.65.
- `--font-mono` → **IBM Plex Mono** (400/500) — metadata only: word counts, save
  state, rubric codes, kickers. Tailwind: `font-mono`.

## Color tokens

Semantic shadcn tokens (`--background`, `--foreground`, `--primary`, `--muted`,
`--border`, …) resolve to the Scriptorium palette. Additional raw accents are
exposed for the annotation/feedback motif:

- `oxford` — `DEFAULT / deep / tint / line / hl`
- `ochre` — `DEFAULT / tint / line / hl`

Light bases: paper `#F7F8FA`, sheet `#FFFFFF`, canvas `#EDEFF2`, ink `#232936`,
slate `#5A6272`. Dark ("lamplight") bases: paper `#14161C`, sheet `#1C1F27`,
ink `#E6E8EE`; accents lighten (Oxford → `#8FAEDC`, Ochre → `#D8B36A`) and hover
_lightens_ instead of darkening.

## The signature motif

Feedback is a tutor's inline annotation, never a punitive mark:

- `.annot-issue` — wavy **ochre** underline (grammar issue).
- `.annot-suggestion` — wavy **oxford** underline (style suggestion).
- `.kicker` — mono uppercase section label (e.g. `STREAK`, `GOAL`).
- `.meta` — mono metadata (counts, save state).

Feedback cards pair a tint background with a matching accent:
`bg-ochre-tint` + `text-ochre` for grammar; `bg-oxford-tint` + `text-oxford`
for style. See `src/components/Feedback.tsx` for the realized pattern.

## Building new UI

- One **primary** (filled Oxford) action per view; everything else is `ghost`.
- Reach for tokens, not hex — `bg-card`, `text-muted-foreground`, `border-border`,
  `text-brand`, `bg-oxford-tint`, etc. — so light/dark and future retunes stay
  free.
- Labels sentence case; section labels via `<Badge variant="eyebrow">` or
  `.kicker`; any number/timestamp/code in `font-mono`.
- Keep motion minimal: instant state changes or short opacity/color fades.
