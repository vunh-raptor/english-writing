# Flowrite

**Write English freely. Polish it later.**

A calm, distraction-free **freewriting** app for people learning English as a
second language. The whole design serves one goal:

> **Maximize production, minimize the anxiety that makes people quit.**

Most language apps are input-heavy (multiple choice, matching, listening). The
thing they under-serve is *output* — and producing language is exactly what
builds real grammatical competence (Swain's output hypothesis) and exactly
where the fear lives. Flowrite is built entirely around getting you to produce
English without flinching, then feel good about it.

---

## The core loop

1. **Never a blank page.** Every session opens with a leveled, *personal*
   prompt and a sentence-starter, drawn from a **real-life syllabus** (below).
   You write about your own life and opinions — which is what makes writing feel
   meaningful (and meaning is what drives flow).
2. **Write phase.** A calm full-screen editor. **No spellcheck, no red
   squiggles, no correction mid-flow** — the generator and the editor are
   different mental modes, and switching on the editor is what kills fluency. A
   timer or word goal reframes success as *don't stop*, not *be good*.
3. **Celebrate.** The moment you finish, a juicy micro-win: confetti, a soft
   chime, count-up stats, and your streak.
4. **Feedback phase.** On-demand, opt-in, and *after* writing — it always leads
   with what went well and offers at most a couple of gentle suggestions framed
   as ideas to play with, never as errors.
5. **Habit engine.** Streaks **with forgiveness** (freeze tokens cover a missed
   day) and rewards that show **real growth** — "+12 new words this week",
   vocabulary size, sentence-length trends — instead of hollow points.

## The modes

Flowrite is one writing loop with several ways in:

| Mode | Route | What it is |
| --- | --- | --- |
| **Freewrite** | `/` → `/write` | The core loop: a leveled prompt + sentence-starter, calm editor, celebrate, optional feedback. Works fully offline. |
| **Trending** | `/trending` | Pick a current subject (Hacker News + operator feed) → an AI **sectioned scenario**: react → take a side → reply → imagine, one small beat at a time. |
| **Phrase Coach** | `/coach` | A real-time chat that drills today's due native phrases (Leitner **spaced repetition**) until you produce each one *independently* — scaffold, then fade. Each phrase carries "similar ways" the coach also accepts. |
| **News Chat** | `/news` | A fully online conversation over one curated real-news subject whose only job is to **force production** — every AI turn ends in one concrete writing demand, with tappable stall-help. See [`docs/NEWS_CHAT.md`](docs/NEWS_CHAT.md). |
| **Progress** | `/progress` | Streak, vocabulary growth, sentence-length trends. |
| **Settings** | `/settings` | Goal type, difficulty, practice themes, AI on/off, theme (light/dark). |

## Prompts: a managed, real-life syllabus

Prompts aren't a flat hardcoded list — they're a small **syllabus** organized
around the situations people actually need English for:

🌤️ Everyday life · 💼 Work & email · 💬 Friends & social · ⚖️ Opinions & debate
· ✈️ Travel & places · 📖 Stories & memories · 🌱 Goals & reflection

- Every prompt is tagged by **theme** and **level**, and the daily prompt
  **rotates across themes** for balanced coverage.
- In **Settings → "What are you practicing for?"** you pick the themes you care
  about; prompts are drawn from those.
- With AI enabled, **"✨ Generate fresh"** creates new, scenario-grounded prompts
  for your theme + level (**server-side**). The curated syllabus is always the
  fallback, so nothing breaks when AI is off.

## How the design maps to the science

| Principle | In the app |
| --- | --- |
| Output builds competence | The entire app is a writing-output loop |
| Freewriting → fluency | Continuous writing, zero mid-flow correction |
| Kill the inner critic | `spellCheck` off; no grammar UI while writing |
| Never the blank page | Leveled prompt + sentence-starter every session |
| Goal = momentum, not quality | Timer / word goal, "I'm done" any time |
| Flow conditions | Clear goal, instant feedback, difficulty calibrated to level |
| Defer signup until after a win | Write as a guest first, then sign up to save |
| Streaks, but forgiving | Streak **freeze** tokens absorb missed days |
| Reward growth, not grinding | New words, vocabulary, sentence-length trends |
| Make the win feel great | Confetti + chime + count-up on completion |

---

## Tech stack

A single **Next.js App Router** application — UI, API, and server-side AI in one
codebase, deployed on **Vercel**.

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 14 (App Router)** + **React 18** + **TypeScript** |
| UI | **Tailwind CSS** + **shadcn/ui** (new-york style, stone base) on **Radix** primitives, **lucide-react** icons, **next-themes** for light/dark |
| Server AI | **Server-only AI gateway** — Groq · Google Gemini · Anthropic, selected by env key (`src/lib/server/ai.ts`). Keys never reach the browser. |
| Content sources | Pluggable **trend adapters** (Hacker News + operator `custom` feed) and **news adapters** (Google News RSS, GDELT, Reddit) — all keyless. |
| State (today) | Client `localStorage`, guest-first. See *Status*. |
| Auth + DB (next) | **Supabase** (Postgres + Auth). Dependencies are installed; wiring is the next phase. |
| Hosting | **Vercel** (Hobby tier); a Vercel Cron warms trend/news caches. |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture, and
[`docs/PATTERNS.md`](docs/PATTERNS.md) for how this app's Next.js fullstack
pattern compares to module-driven and feature-driven architectures.

### Status

The **freewriting, trending, coach, and news** flows are built and run today.
All AI is server-side. **Writing, streak, and progress state currently live in
`localStorage`** (write as a guest, no account needed). **Supabase auth + a
Postgres data layer is the next phase** — the packages are installed but not yet
wired, so there is no `supabase/` schema in the repo yet.

## AI (server-side, free tier)

The app works fully without AI — on-device feedback plus the curated syllabus.
When the operator sets a provider key, **Settings → "Use AI"** unlocks warmer
feedback, fresh prompts, and the trending/coach/news modes. Keys live in
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

The core freewriting experience runs with **no keys at all**. AI features
activate once a provider key is set; trending/news activate with network access
(and optionally `CUSTOM_TRENDS_URL`).

## Deploy (Vercel)

1. Import the repo into **Vercel**.
2. Set env vars from `.env.example` in the Vercel dashboard (at least one AI key
   for the AI modes).
3. Deploy. A Vercel Cron job can warm `/api/trends` and `/api/news/subject` so
   the first load is instant.

Supabase (auth + DB) plugs in during the next phase; see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Project layout

```
src/
  app/
    layout.tsx                 # root: <html><body> + providers, theme
    globals.css
    write/page.tsx             # full-screen writing surface (no chrome)
    (main)/                    # topbar + tab nav
      layout.tsx
      page.tsx                 #  "/"  → Home (mode + prompt picker)
      trending/  coach/  news/  progress/  settings/   (page.tsx each)
    (session)/                 # brand-only chrome
      layout.tsx
      celebrate/page.tsx
      feedback/page.tsx
    api/
      health/route.ts
      trends/route.ts          # GET cached trends (HN + custom)
      scenarios/route.ts       # POST { trendId | subject } → sectioned scenario
      feedback/route.ts        # POST → AI feedback
      prompts/generate/route.ts, sparks/route.ts, coach/route.ts
      news/subject/route.ts    # GET curated live news subject
      converse/route.ts        # POST → News Chat turn (the production engine)
      converse/assist/route.ts, converse/recap/route.ts
  components/
    Home, Write, Celebrate, Feedback, Progress, Settings, Trending,
    Coach, NewsChat, Confetti, app-nav, page-container, theme-*
    ui/                        # shadcn/ui primitives
  lib/
    shared/   # pure, isomorphic: date, stats, streak, srs, prompts, phrases, sparks, feedback
    client/   # browser-only: storage, sound, ai/clientApi (fetch our API)
    server/   # server-only ("server-only"): ai gateway, aiTasks, trends, news, scenario, coach, newsChat
    utils.ts
  store/
    StoreContext.tsx           # persisted on-device state (localStorage today)
    SessionFlowContext.tsx     # ephemeral write-session flow
    AppProviders.tsx           # composes the providers
  types.ts
docs/
  ARCHITECTURE.md   NEWS_CHAT.md   PATTERNS.md
```

Imports use the `@/*` alias (mapped to `src/*`), e.g. `@/lib/shared/stats`,
`@/components/Write`, `@/store/StoreContext`.

---

*One honest caveat, built into the design: the output hypothesis is partly, not
fully, empirically confirmed — writing is necessary but not sufficient. So
Flowrite pairs the production loop with light, encouraging feedback rather than
treating raw output as the whole story.*
