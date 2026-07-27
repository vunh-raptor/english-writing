# Flowrite

**Learn the word today. Say it yourself today.**

A calm English-learning app for people who can read far more than they can
produce. The whole design serves one goal:

> **Maximize production, minimize the anxiety that makes people quit.**

Most language apps are input-heavy (multiple choice, matching, listening). The
thing they under-serve is *output* — and producing language is exactly what
builds real competence (Swain's output hypothesis) and exactly where the fear
lives. So there is no flashcard flip anywhere in Flowrite: every round, in
every mode, ends with a sentence **you** wrote.

---

## The core loop

1. **A small set, every day.** Five new high-frequency words plus whatever your
   schedule says is ripe. Small enough to always finish — finishing is the
   habit.
2. **Meet it once, properly.** The card: the word, plain meaning, a real
   example, the words it travels with. Held for a few seconds so nobody skips
   the encounter.
3. **Write it back from memory.** The word disappears; you type it from its
   meaning. Recall, not recognition — pulling it back is what builds the memory.
4. **Use it for real.** An ordinary moment that calls for it, answered in your
   own sentence. Composing your own use is the strongest predictor a word
   survives the week.
5. **Habit engine.** Streaks **with forgiveness** (freeze tokens cover a missed
   day) and rewards that show **real growth** — words met, "+12 new words this
   week", a vocabulary counted only from sentences you actually wrote —
   instead of hollow points.

## The modes

Three surfaces, one pool of language and one spaced schedule underneath:

| Mode | Route | What it is |
| --- | --- | --- |
| **Daily words** | `/` → `/words` | The daily habit: a frequency-first set of new words, each walked **meet → write it from memory → use it in a real moment**, then handed to spaced repetition. Works fully offline. See [`docs/DAILY_WORDS.md`](docs/DAILY_WORDS.md). |
| **News Chat** | `/news` | A fully online conversation over one curated real-news subject whose only job is to **force production** — every AI turn ends in one concrete writing demand, with tappable stall-help. See [`docs/NEWS_CHAT.md`](docs/NEWS_CHAT.md). |
| **Phrasebook** | `/phrasebook` | Your commonplace book: every word you've met and every phrase you've highlighted, practiced four ways (Mixed · Recall · Sprint · Study — one per strand of a balanced program). See [`docs/PHRASEBOOK.md`](docs/PHRASEBOOK.md). |
| **Settings** | `/settings` | Words a day, your level, finish sound, theme (light/dark). |

**They feed each other.** A word met in Daily words lands in the Phrasebook on
its schedule. A phrase highlighted mid-conversation in News Chat lands there
too. Anything the schedule says is ripe comes back in tomorrow's set. One
curriculum, three ways in.

## The curriculum: frequency first, and deliberately unrelated

The words aren't a flat list of impressive vocabulary — they're a curated,
**frequency-ordered** spine banded A2 → C1, because roughly 2,800 high-frequency
words cover **>92%** of general English text (the New General Service List).
Those are the words worth ten minutes a day.

Two rules govern how a day is drawn:

- **Nearest band first.** Sets come from your level, widening outward only as
  it runs dry — so the words are always ones you could plausibly use tomorrow.
- **No two words from the same semantic field in one day.** Teaching a
  same-topic cluster (synonyms, opposites, "five kinds of weather") measurably
  *slows* learning through cross-association — so every entry carries a `field`
  and a day's set never repeats one. Most apps do the opposite.

## How the design maps to the science

| Principle | In the app |
| --- | --- |
| Output builds competence | Every round in every mode ends in your own sentence |
| High-frequency words first | A frequency-ordered curriculum, drawn at your band |
| Deliberate beats incidental | A chosen daily set, not "read more and hope" |
| Retrieval beats re-study | The word is hidden and typed back from its meaning |
| Recall beats recognition | You type it — never pick it from four options |
| Involvement load / generation | The round that earns an interval is the one you compose |
| Avoid semantic interference | A day's words never share a semantic field |
| Spacing beats massing | Leitner boxes; every day mixes reviews with new |
| Words travel in company | Every card carries its natural partner chunks |
| Defer signup until after a win | Learn as a guest first, then sign up to save |
| Streaks, but forgiving | Streak **freeze** tokens absorb missed days |
| Reward growth, not grinding | Words met, words mastered, vocabulary you wrote |
| Make the win feel great | A soft chime and an honest debrief on completion |

The full evidence, with the honest caveats, is in
[`docs/DAILY_WORDS.md`](docs/DAILY_WORDS.md).

---

## Tech stack

A single **Next.js App Router** application — UI, API, and server-side AI in one
codebase, deployed on **Vercel**.

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 14 (App Router)** + **React 18** + **TypeScript** |
| UI | **Tailwind CSS** + **shadcn/ui** (new-york style, stone base) on **Radix** primitives, **lucide-react** icons, **next-themes** for light/dark |
| Server AI | **Server-only AI gateway** — Groq · Google Gemini · Anthropic, selected by env key (`src/lib/server/ai.ts`). Keys never reach the browser. |
| Content sources | A bundled **word curriculum** (no I/O) + keyless **news adapters** (Google News RSS, GDELT, Reddit). |
| State (today) | Client `localStorage`, guest-first. See *Status*. |
| Auth + DB (next) | **Supabase** (Postgres + Auth). The schema is landed under `supabase/` with a typed data-access layer; Auth is the remaining step. |
| Hosting | **Vercel** (Hobby tier); a Vercel Cron warms the news cache. |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture, and
[`docs/PATTERNS.md`](docs/PATTERNS.md) for how this app's Next.js fullstack
pattern compares to module-driven and feature-driven architectures.

### Status

The **daily words, news chat, and phrasebook** flows are built and run today.
All AI is server-side. **Your pool, schedule, streak, and vocabulary live in
`localStorage`** (learn as a guest, no account needed). **Supabase auth is the
remaining phase** — the Postgres schema and a typed data-access layer are in the
repo (`supabase/`, `src/lib/server/db/`), ready to wire once Auth lands.

## AI (server-side, free tier)

The daily habit works with **no AI at all**: the curriculum, cards, recall
check, judging fallback and schedule are all local. A provider key makes the
"use it" moments personal and unlocks the conversational modes. Keys live in
**server env vars**, never the browser:

```
GROQ_API_KEY=…       # free: https://console.groq.com/keys
GEMINI_API_KEY=…     # free: https://aistudio.google.com/apikey
ANTHROPIC_API_KEY=…  # optional, paid
```

Any one provider is enough; the server picks the first configured (override with
`AI_PROVIDER`). Models are configurable via `GROQ_MODEL` / `GEMINI_MODEL` /
`ANTHROPIC_MODEL`. See [`.env.example`](.env.example).

> **News Chat is inherently online** and has no offline fallback subject — if the
> news can't be fetched or no AI is configured, it says so honestly rather than
> faking content.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys you have (all optional for the core app)
npm run dev                  # http://localhost:3000
```

Other scripts:

```bash
npm run build && npm start   # production build + serve
npm run lint                 # next lint
npm run typecheck            # tsc --noEmit
```

Daily words runs end to end with **no keys at all**. A provider key makes its
moments personal and turns on News Chat and the Phrasebook's Mixed mode; News
Chat also needs network access.

## Deploy (Vercel)

1. Import the repo into **Vercel**.
2. Set env vars from `.env.example` in the Vercel dashboard (at least one AI key
   for the AI modes).
3. Deploy. A Vercel Cron job can warm `/api/news/mission` so the first load is
   instant.

Supabase (auth + DB) plugs in during the next phase; see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Project layout

```
src/
  app/
    layout.tsx                 # root: <html><body> + providers, theme
    globals.css
    (main)/                    # the app shell: desktop rail / mobile tab bar
      layout.tsx
      page.tsx                 #  "/"  → redirect to /words
      words/  news/  phrasebook/  settings/     (page.tsx each)
    api/
      health/route.ts
      words/daily/route.ts     # POST → a real-life moment per word in today's set
      news/mission/route.ts    # GET today's planned News Chat mission
      converse/route.ts        # POST → News Chat turn (the production engine)
      converse/{bridge,continue,ask,debrief}/route.ts
      phrasebook/{enrich,drill,judge}/route.ts
  components/
    DailyWords, NewsChat, NewsDashboard, News, Phrasebook,
    SelectionCapture, Settings, app-nav, page-container, theme-*
    ui/                        # shadcn/ui primitives
  lib/
    shared/   # pure, isomorphic: date, stats, streak, srs, words, phrases
    client/   # browser-only: storage, sound, clientApi, supabase
    server/   # server-only ("server-only"): ai gateway, words, news, mission,
              #   phrasebook, supabase + db/
    utils.ts
  store/
    StoreContext.tsx           # persisted on-device state (localStorage today)
    AppProviders.tsx           # composes the providers
  types.ts
supabase/
  migrations/                  # Postgres schema + RLS (ready to wire)
docs/
  DAILY_WORDS.md   NEWS_CHAT.md   NEWS_CHAT_V2.md   PHRASEBOOK.md
  ARCHITECTURE.md  DESIGN_SYSTEM.md  PATTERNS.md
```

Imports use the `@/*` alias (mapped to `src/*`), e.g. `@/lib/shared/words`,
`@/components/DailyWords`, `@/store/StoreContext`.

---

*One honest caveat, built into the design: the output hypothesis is partly, not
fully, empirically confirmed — producing is necessary but not sufficient. So
Flowrite pairs the production loop with real input (a proper first encounter,
worked examples, real news) rather than treating raw output as the whole story.*
