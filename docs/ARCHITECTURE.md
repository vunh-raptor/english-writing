# Flowrite — Architecture

Flowrite is a **single Next.js App Router application**: the writing UI, the
JSON API, and all server-side AI live in one codebase and deploy as one unit to
Vercel. There is no separate backend, no monorepo, and no message queue. This
document describes what is actually built; for *why* this shape (vs. a
module-driven backend), see [`PATTERNS.md`](PATTERNS.md).

## The stack

| Concern | Choice |
| --- | --- |
| App framework | **Next.js 14 (App Router)** — one app: React UI + API route handlers. |
| Language | **TypeScript** throughout (`@/*` → `src/*`). |
| UI | **Tailwind CSS** + **shadcn/ui** (new-york style, stone base) on **Radix** primitives; **lucide-react** icons; **next-themes** for light/dark. |
| Server AI | A **server-only gateway** (`src/lib/server/ai.ts`) fronting Groq · Google Gemini · Anthropic, chosen by which env key is present. Keys never leave the server. |
| Content sources | A bundled, frequency-ordered **word curriculum** (no I/O at all) plus keyless server **news adapters** (Google News RSS, GDELT, Reddit). |
| Client state (today) | Browser **`localStorage`**, guest-first (`src/lib/client/storage.ts`, `src/store/StoreContext.tsx`). |
| Auth + DB (in progress) | **Supabase** (Postgres + Auth). The Postgres **schema exists** (`supabase/migrations/`, RLS) with a typed server data-access layer (`src/lib/server/db/`) — see [`../supabase/README.md`](../supabase/README.md). Ready to wire; **Auth is not connected yet**, so the live app still runs guest-first on `localStorage`. |
| Hosting | **Vercel** (Hobby). A Vercel Cron can warm the trend/news caches. |

---

## Layers

The whole system is three layers inside one Next.js app.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React, "use client")                               │
│  DailyWords · NewsChat · Phrasebook · Settings                │
│                                     state: localStorage       │
└───────────────┬──────────────────────────────────────────────┘
                │  fetch() JSON  (src/lib/client/{clientApi,ai}.ts)
┌───────────────▼──────────────────────────────────────────────┐
│  Next.js Route Handlers  (src/app/api/**/route.ts)           │
│  thin: validate input → call a server module → return JSON    │
└───────────────┬──────────────────────────────────────────────┘
                │  import "server-only"
┌───────────────▼──────────────────────────────────────────────┐
│  Server modules  (src/lib/server/*)                          │
│  ai gateway · words · news · mission · phrasebook            │
│      │                         │                              │
│      ▼                         ▼                              │
│  AI providers            Content adapters                     │
│  Groq/Gemini/Anthropic   Google News · GDELT · Reddit         │
│  (env keys)              (keyless)                            │
└──────────────────────────────────────────────────────────────┘
```

The **`import "server-only"`** marker on the server modules and the AI gateway
is the hard boundary: anything that touches a provider key or a secret can only
be reached from a route handler, never bundled into the client.

### The `lib` split

`src/lib` is deliberately partitioned so the same tree can't leak server code to
the browser:

| Folder | Runs where | Contents |
| --- | --- | --- |
| `lib/shared` | isomorphic, pure | `date`, `stats`, `streak`, `srs`, `words` (the daily-word curriculum + day-set rules), `phrases` (drill methods + matchers). No I/O, no keys. |
| `lib/client` | browser only | `storage` (localStorage), `sound`, `clientApi` (fetch our own API), `supabase` (browser client). |
| `lib/server` | server only (`"server-only"`) | `ai` gateway, `words`, `news`, `mission`, `phrasebook`, `supabase` + `db/`. |

Because the stats/streak/SRS logic lives in `lib/shared`, it runs on the client
today and can move behind the API unchanged when Supabase lands.

### Routing & UI shells

Screens are real routes grouped by their chrome using App Router route groups:

- `app/(main)` — the shell every screen lives in: a persistent left rail on
  desktop (collapsing to a 72px icon strip), a top bar + bottom tab bar on
  mobile. Holds Daily words, News chat, Phrasebook and Settings.
- `/` redirects to `/words` — the day starts with today's words.

A mode's own session state (which round, the draft, timing) is local component
state, deliberately: a session is a single screen's concern and is never
resumable from a URL. Durable on-device state (the lexical pool and its
schedule, the day's issued words, streak, vocabulary, saved conversations,
settings) lives in **`StoreContext`**, persisted to `localStorage`.
`AppProviders` composes it with the theme provider.

---

## The AI gateway

`src/lib/server/ai.ts` is a small provider-agnostic gateway:

- `resolveProvider()` picks the first configured provider in order Groq →
  Gemini → Anthropic, overridable with `AI_PROVIDER`. Models default sensibly
  and are overridable (`GROQ_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`).
- `chatComplete(system, messages, maxTokens)` — multi-turn completion. Groq uses
  the OpenAI-compatible endpoint, Gemini its `generateContent` API, Anthropic
  the SDK. `rawComplete(system, user)` is the single-shot helper.
- `aiConfigured()` lets the UI degrade gracefully: with no key, the app falls
  back to on-device feedback and the curated syllabus; AI modes announce
  themselves as unavailable.

Higher-level prompt construction lives in the feature modules (`words.ts`,
`mission.ts`, `phrasebook.ts`).

## Content adapters

Fetching third-party content server-side is what a backend is *for* here (CORS,
keys, caching, ToS isolation). One adapter family, keyless by default:

- **News** (`lib/server/news.ts`): `fetchNewsHeadlines()` fans out to Google
  News RSS, GDELT, and Reddit (`r/worldnews` et al.), dedupes, and returns a
  ranked list for News Chat's curation step. No keys required.

Route handlers cache these responses at the edge (`revalidate`), and a Vercel
Cron can warm them so the first user load is instant.

Daily words deliberately has **no** adapter: its curriculum is a curated,
frequency-ordered list bundled in `lib/shared/words.ts`, so the mode that has
to work every single day has nothing to fetch and nothing to fail
([`DAILY_WORDS.md`](DAILY_WORDS.md)).

---

## API surface

All handlers are thin: validate → call a `lib/server` module → return JSON.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness. |
| `POST /api/words/daily` | One call per daily set: a real-life moment per word to produce it in. |
| `GET /api/news/mission` | Today's planned News Chat mission, cached per (day, level). |
| `POST /api/converse` | News Chat turn — the scene-partner engine (state merged in code). |
| `POST /api/converse/bridge` | "Say it your way": intent (any language) → keywords + gapped frame. |
| `POST /api/converse/continue` | "Next words": a stalled mid-sentence draft → next-word options + a gapped continuation frame. Never a completion. |
| `POST /api/converse/ask` | "Ask · anything": translate / explain / rephrase aide. |
| `POST /api/converse/debrief` | Closing debrief: per-target results, ≤2 upgrades, keep-phrases → SRS. |
| `POST /api/phrasebook/enrich` | A captured highlight → reusable form + meaning + transfer example. |
| `POST /api/phrasebook/drill` | One call per practice session: a real-life situation per due phrase. |
| `POST /api/phrasebook/judge` | Honest per-answer judgment: applied in their own sentence, or not. |

The News Chat contracts (`/api/news/*`, `/api/converse/*`) — subject curation,
the director prompt, stall assist, recap — are documented in detail in
[`NEWS_CHAT.md`](NEWS_CHAT.md); the daily-word contract in
[`DAILY_WORDS.md`](DAILY_WORDS.md).

## Prompt-injection posture

Crawled titles, snippets, and everything the learner types are treated as
**untrusted data, never instructions**. The system prompts state this
explicitly, we pass third-party text as clearly-delimited content to write
about, and nothing from it is ever executed. Structured JSON contracts are kept
tiny (a handful of fields) for reliability on fast free-tier models; parsing
fails soft so a bad response never breaks the writing flow.

---

## State today, and the Supabase phase

**Today:** all durable state is client-side in `localStorage`, guest-first —
you can learn words, build a streak, and watch your vocabulary grow with no
account. This is the "defer signup until after a win" retention insight, and it
means the core app has zero backend dependencies.

**Next phase — Supabase:** real accounts and multi-device sync. Because the
stats/streak/SRS logic already lives in `lib/shared`, the migration is mostly
additive rather than a rewrite:

1. Add Supabase Auth (email magic-link + Google OAuth) with `@supabase/ssr`;
   keep the guest-first flow — a new visitor does one day of words as a guest,
   then the debrief invites sign-up to *save your streak*, and the guest's pool
   and schedule are claimed on signup.
2. The Postgres schema is **landed** (SQL migrations under `supabase/`, RLS):
   `profiles` (streak/totals + rolling level), `news_sessions`, and `phrases`
   (the shared library + its Leitner schedule, fed by all three surfaces), with
   a typed data-access layer in `src/lib/server/db/`. `supabase-js` from the
   server — no ORM, to avoid serverless connection-pool pain. See
   [`../supabase/README.md`](../supabase/README.md); `vocab` and the day-keyed
   tallies (`wordDays`, `phraseApplied`) are the next tables.
3. Move the currently-client stats/streak/vocab merge behind the API so they're
   consistent across devices and can't be tampered with. The client keeps light
   display helpers and swaps `localStorage` reads for API calls.

Caching stays table- and edge-based (`fetched_at`/TTL + `revalidate`), and
scheduled work stays on **Vercel Cron** — no long-running worker or Redis on the
free tier. Sharing generated news subjects across users (keyed by day + level)
is the main cost lever.

## Offline posture

Two postures, chosen per mode by what the mode is *for*.

- **Daily words works fully offline.** It's the daily habit, so it can't depend
  on a network: the curriculum, the cards, the recall check, the judging
  fallback and the schedule are all local. The AI call only makes the "use it"
  moments personal, and a failure downgrades to local moments silently.
- **The Phrasebook degrades.** Its Mixed mode wants the round-builder; Recall,
  Sprint and Study run on stored material alone.
- **News Chat requires the network** and deliberately has no offline fallback
  subject — it fails honestly rather than faking today's news.

## Ops notes

- **Secrets** in Vercel env vars only; the `"server-only"` boundary keeps them
  out of the bundle.
- **Model choice** is per-task and configurable: a cheap fast model (e.g. Groq
  llama-3.3-70b) for real-time turns, a stronger one where adherence matters.
- **Cost control** is caching + short, per-user conversations + rate limits
  (added with the Supabase phase).
