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
3. **Then a drill pitched at how well you know it.** Five rungs, and the one a
   word gets is decided by its spaced-repetition box, so the ask hardens as the
   memory does: type it from its meaning → fill it into a real sentence in the
   right form → supply its missing partner word (`___ a decision`) → repair a
   sentence that uses it *almost* right → and eventually **echo**: a sentence
   *you* wrote weeks ago, with the word cut out. Every rung is typed, never
   picked from a list.
4. **Use it for real.** An ordinary moment that calls for it, answered in your
   own sentence. Composing your own use is the strongest predictor a word
   survives the week — so it's the round every word ends on, and the only one
   that earns a longer interval.
5. **The bridge.** One bonus sentence using two of today's words. They're
   unrelated on purpose; making the link is the point.
6. **Habit engine.** Streaks **with forgiveness** (freeze tokens cover a missed
   day) and rewards that show **real growth** — words met, "+12 new words this
   week", a vocabulary counted only from sentences you actually wrote —
   instead of hollow points.

## The modes

Three surfaces, one pool of language and one spaced schedule underneath:

| Mode | Route | What it is |
| --- | --- | --- |
| **Daily words** | `/` → `/words` | The daily habit: a frequency-first set of new words, each walked **meet → drill → use it in a real moment**, where the drill climbs a five-rung ladder as the word's spaced-repetition box rises. See [`docs/DAILY_WORDS.md`](docs/DAILY_WORDS.md). |
| **Respond** | `/respond` | You bring the English: paste a post, an article, a newsletter, or hand over a link. The app gives you **questions and never answers** until you have an angle of your own — then you write it. Undrafted angles wait in an idea bank. See [`docs/RESPOND.md`](docs/RESPOND.md). |
| **News Chat** | `/news` | A fully online conversation over one curated real-news subject whose only job is to **force production** — every AI turn ends in one concrete writing demand, with tappable stall-help. See [`docs/NEWS_CHAT.md`](docs/NEWS_CHAT.md). |
| **Transcribe** | `/transcribe` | The one mode where the English arrives as **sound**: fifteen seconds of a clip at a time, written down from listening alone, then said back in your own mouth. The clip only advances when the dictation clears 90% and the chunk has been shadowed once; every tenth chunk closes with a comprehension check. Clip transcripts are bundled, so scoring needs no AI. See [`docs/TRANSCRIBE.md`](docs/TRANSCRIBE.md). |
| **Phrasebook** | `/phrasebook` | Your commonplace book: every word you've met and every phrase you've highlighted, practiced four ways (Mixed · Recall · Sprint · Study — one per strand of a balanced program). See [`docs/PHRASEBOOK.md`](docs/PHRASEBOOK.md). |
| **Settings** | `/settings` | Words a day, your level, finish sound, theme (light/dark). |

**They feed each other.** A word met in Daily words lands in the Phrasebook on
its schedule. A phrase highlighted while reading in Respond, or mid-conversation
in News Chat, lands there too. Anything the schedule says is ripe comes back in
tomorrow's set. One curriculum, four ways in.

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
| Retrieval beats re-study | Every drill rung is a retrieval, never a re-read |
| Recall beats recognition | You type it — never pick it from four options |
| Desirable difficulties | The drill rung hardens as the word's box rises |
| Personally meaningful cues | `echo` gaps a sentence *you* wrote, weeks later |
| Elaborative encoding | The bridge: two unrelated words, one sentence |
| Reading feeds phraseology | Respond: you always write *after* reading a real source |
| Elaborative interrogation | Respond asks questions and never supplies answers |
| Source-based writing borrows | Every angle is checked against the source's wording |
| Involvement load / generation | The round that earns an interval is the one you compose |
| Avoid semantic interference | A day's words never share a semantic field |
| Spacing beats massing | Leitner boxes; every day mixes reviews with new |
| Words travel in company | Every card carries its natural partner chunks |
| Defer signup until after a win | ~~Guest-first~~ — removed; the app is now account-only (see *Status*) |
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
| State | Postgres via Supabase, per account, behind RLS. See *Status*. |
| Auth + DB | **Supabase** (Postgres + Auth) — a hard dependency. Passwordless sign-in (magic link + Google); every table RLS'd per account. |
| Hosting | **Vercel** (Hobby tier); a Vercel Cron warms the news cache. |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture, and
[`docs/PATTERNS.md`](docs/PATTERNS.md) for how this app's Next.js fullstack
pattern compares to module-driven and feature-driven architectures.

### How changes get made

Flowrite is developed with **Claude as the coding agent**, on a fixed cycle:
frame → plan → build → prove → ship → review → sync docs. The rules an agent
must not break live in [`CLAUDE.md`](CLAUDE.md); the cycle itself, and who owns
which stage, is in [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

### Status

The **daily words, respond, news chat, transcribe, and phrasebook** flows are
built and run today. All AI is server-side. **Your pool, schedule, streak, and
vocabulary live in your account**, so they follow you between devices.
**Supabase is now a hard dependency**: sign-in is passwordless (magic link or
Google), every durable thing lives in Postgres under RLS, and nothing is written
to the browser. Point the app at a project (`.env.example`) and run the
migrations in `supabase/migrations/` before it will do anything.

Transcribe's curated clips are currently read aloud by the browser's own speech
synthesis, because they ship transcripts rather than video and the mode has to
work offline. Giving a clip a `videoId` in `src/lib/shared/clips.ts` switches it
to the real YouTube player; pasted links already use it.

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
npm run verify               # THE GATE: lint + typecheck + unit tests + build
npm test                     # Vitest — pure logic in src/lib/shared
npm run e2e                  # build + Playwright smoke of the core writing loop
npm run build && npm start   # production build + serve
npm run lint                 # next lint
npm run typecheck            # tsc --noEmit
```

`npm run verify` is what CI runs on every pull request — deliberately with **no
API keys**, since the claim that the core loop works without an AI provider is
only worth anything if it's enforced.

Daily words runs end to end with **no keys at all**. A provider key makes its
moments personal and turns on Respond's tailored questions, News Chat, and the
Phrasebook's Mixed mode; Respond's link-fetching and News Chat also need network
access.

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
      words/  news/  respond/  transcribe/  phrasebook/  settings/  (page.tsx each)
    api/
      health/route.ts
      words/daily/route.ts     # POST → a real-life moment per word in today's set
      news/mission/route.ts    # GET today's planned News Chat mission
      converse/route.ts        # POST → News Chat turn (the production engine)
      converse/{bridge,continue,ask,debrief}/route.ts
      phrasebook/{enrich,drill,judge}/route.ts
      respond/{source,questions,sharpen,ideas,polish}/route.ts
      transcribe/{chunks,explain,milestone,judge}/route.ts
  components/
    DailyWords, NewsChat, NewsDashboard, News, Phrasebook, Respond,
    Transcribe, TranscribeSession, SelectionCapture, Settings, app-nav,
    page-container, theme-*
    ui/                        # shadcn/ui primitives
  lib/
    shared/   # pure, isomorphic: date, stats, streak, srs, words, phrases,
              #   respond, transcribe (scoring + chunking), clips (listening)
      __tests__/  # Vitest specs for the pure logic
    client/   # browser-only: storage, sound, clientApi, supabase, player,
              #   speech, recorder
    server/   # server-only ("server-only"): ai gateway, words, respond, extract,
              #   news, mission, phrasebook, transcribe, supabase + db/
    utils.ts
  store/
    StoreContext.tsx           # learner state, loaded/dispatched via /api/state
    AppProviders.tsx           # composes the providers
  types.ts
supabase/
  migrations/                  # Postgres schema + RLS (ready to wire)
e2e/                # Playwright smoke test for the core daily loop
docs/
  DAILY_WORDS.md   RESPOND.md   NEWS_CHAT.md   NEWS_CHAT_V2.md   PHRASEBOOK.md
  ARCHITECTURE.md  DESIGN_SYSTEM.md  PATTERNS.md  WORKFLOW.md
.claude/
  settings.json     # permissions + SessionStart hook
  commands/         # /spec  /checks  /ship  /docsync
  hooks/            # session-start.sh (installs deps in web sessions)
  skills/verify/    # how to drive the real app to verify AI surfaces
.github/workflows/ci.yml
```

Imports use the `@/*` alias (mapped to `src/*`), e.g. `@/lib/shared/words`,
`@/components/DailyWords`, `@/store/StoreContext`.

---

*One honest caveat, built into the design: the output hypothesis is partly, not
fully, empirically confirmed — producing is necessary but not sufficient. So
Flowrite pairs the production loop with real input (a proper first encounter,
worked examples, real news) rather than treating raw output as the whole story.*
