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
   prompt and a sentence-starter, drawn from a **real-life syllabus** (see
   below). You write about your own life and opinions — which is what makes
   writing feel meaningful (and meaning is what drives flow).
2. **Write phase.** A calm full-screen editor. **No spellcheck, no red
   squiggles, no correction mid-flow** — the generator and the editor are
   different mental modes, and switching on the editor is what kills fluency. A
   timer or word goal reframes success as *don't stop*, not *be good*. If you
   pause, a gentle "keep going" pulse nudges you (it never deletes anything).
3. **Celebrate.** The moment you finish, a juicy micro-win: confetti, a soft
   chime, count-up stats, and your streak.
4. **Feedback phase.** On-demand, opt-in, and *after* writing — it always leads
   with what went well and offers at most a couple of gentle suggestions framed
   as ideas to play with, never as errors.
5. **Habit engine.** Streaks **with forgiveness** (freeze tokens cover a missed
   day so one bad day doesn't nuke months of progress), and rewards that show
   **real growth** — "+12 new words this week", vocabulary size, sentence-length
   trends — instead of hollow points.

## Prompts: a managed, real-life syllabus

Prompts aren't a flat hardcoded list — they're a small **syllabus** organized
around the situations people actually need English for:

🌤️ Everyday life · 💼 Work & email · 💬 Friends & social · ⚖️ Opinions & debate
· ✈️ Travel & places · 📖 Stories & memories · 🌱 Goals & reflection

- Every prompt is tagged by **theme** and **level**, and the daily prompt
  **rotates across themes** so you get balanced real-life coverage instead of a
  random pile.
- In **Settings → "What are you practicing for?"** you pick the themes you care
  about (e.g. just Work & email), and prompts are drawn from those.
- With AI enabled, **"✨ Generate fresh"** on the home screen creates new,
  scenario-grounded prompts for your theme + level (generated **server-side**),
  saved into your prompt library. The curated syllabus is always the fallback,
  so this never breaks when AI is off.

## How the design maps to the science

| Principle | In the app |
| --- | --- |
| Output builds competence | The entire app is a writing-output loop |
| Freewriting → fluency | Continuous writing, zero mid-flow correction |
| Kill the inner critic | `spellCheck` off; no grammar UI while writing |
| Never the blank page | Leveled prompt + sentence-starter on every session |
| Goal = momentum, not quality | Timer / word goal, "I'm done" any time |
| Flow conditions | Clear goal, instant feedback, difficulty calibrated to level |
| Private by default | No public audience; your writing is yours |
| Defer signup until after a win | Write as a guest first, then sign up to save your streak |
| Streaks, but forgiving | Streak **freeze** tokens absorb missed days |
| Reward growth, not grinding | New words, vocabulary, sentence-length trends |
| Make the win feel great | Confetti + chime + count-up on completion |

## Stack & status

Migrating from a browser-only app to **online-first full-stack** (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

- **Next.js (App Router)** — UI + API route handlers, deployed on **Vercel**.
- **Supabase** — Postgres + Auth (wired in the next phase).
- **Server-side AI** — free-tier providers (Groq / Gemini), keys in env, never
  the browser.

**Done so far:** Next.js conversion; AI moved server-side (`/api/feedback`,
`/api/prompts/generate`); trends endpoint (`/api/trends`, Hacker News adapter +
custom slot); **Trending mode → sectioned interactive scenarios**
(`/api/scenarios` with a no-key local fallback, plus a multi-step write flow —
react → take a side → reply → imagine, one small beat at a time). **Next:**
Supabase auth + DB (entries/progress), then the in-context word-practice panel.

> During the migration, writing/streak state still uses `localStorage` on the
> client; Phase 1 moves it to Supabase with real accounts (guest-first, then
> sign up to save).

## AI feedback (server-side, free tier)

The app works fully without AI (on-device feedback + the curated syllabus). When
the operator configures a provider key, **Settings → "Use AI"** unlocks warmer
feedback and "✨ generate fresh" prompts. Keys live in **server env vars**, never
the browser:

```
GROQ_API_KEY=…       # free: https://console.groq.com/keys
# or
GEMINI_API_KEY=…     # free: https://aistudio.google.com/apikey
# or ANTHROPIC_API_KEY=…  (optional, paid)
```

Any one provider is enough; the server picks the first configured (override with
`AI_PROVIDER`). See `.env.example`.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in keys you have (all optional for the core app)
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build + serve
```

The core writing experience runs with no keys at all. AI features activate once
a provider key is set; trends activate once deployed with network access (and/or
a `CUSTOM_TRENDS_URL`).

## Deploy (Vercel + Supabase)

1. Create a **Supabase** project; copy the URL + anon/service keys.
2. Import the repo into **Vercel**; set env vars from `.env.example` in the
   Vercel dashboard.
3. Deploy. (A Vercel Cron job warms `/api/trends` on the free tier.)

## Tech

- **Next.js + TypeScript** (App Router). Client app under `app/`, API under
  `app/api/`.
- **Supabase** (Postgres + Auth) — server data layer.
- **Server AI gateway** — Groq / Gemini / Anthropic via env keys.
- Pluggable **trend adapters** (Hacker News today; `custom` slot for a compliant
  social feed / paid trends API).

### Project layout

```
app/
  layout.tsx, page.tsx       # mounts the writing app (client)
  api/
    health/route.ts
    trends/route.ts          # cached trends (HN + custom)
    feedback/route.ts        # AI feedback (server-side keys)
    prompts/generate/route.ts
src/
  App.tsx, Root.tsx          # the SPA (client) + provider root
  types.ts                   # data model
  store/StoreContext.tsx     # client state (localStorage today → API in Phase 1)
  lib/
    prompts.ts               # the syllabus: real-life themes + leveled prompts
    stats.ts, streak.ts      # stats + streak engine (move server-side in Phase 1)
    feedback.ts              # offline, encouragement-first feedback
    ai.ts                    # client → calls /api/* (no keys in the browser)
    server/                  # server-only: ai gateway, aiTasks, trend adapters
    storage.ts, date.ts, sound.ts
  components/
    Home, Write, Celebrate, Feedback, Progress, Settings, Confetti
docs/ARCHITECTURE.md
```

---

*One honest caveat, built into the design: the output hypothesis is partly, not
fully, empirically confirmed — writing is necessary but not sufficient. So
Flowrite pairs the production loop with light, encouraging feedback rather than
treating raw output as the whole story.*
