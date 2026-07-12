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
| Content sources | Keyless server **adapters**: trends (Hacker News + operator `custom` feed) and news (Google News RSS, GDELT, Reddit). |
| Client state (today) | Browser **`localStorage`**, guest-first (`src/lib/client/storage.ts`, `src/store/StoreContext.tsx`). |
| Auth + DB (planned) | **Supabase** (Postgres + Auth). `@supabase/ssr` + `@supabase/supabase-js` are installed but **not yet wired** — no `supabase/` schema exists in the repo yet. |
| Hosting | **Vercel** (Hobby). A Vercel Cron can warm the trend/news caches. |

---

## Layers

The whole system is three layers inside one Next.js app.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React, "use client")                               │
│  Home · Write · Celebrate · Feedback · Progress · Settings   │
│  Trending · Coach · NewsChat        state: localStorage       │
└───────────────┬──────────────────────────────────────────────┘
                │  fetch() JSON  (src/lib/client/{clientApi,ai}.ts)
┌───────────────▼──────────────────────────────────────────────┐
│  Next.js Route Handlers  (src/app/api/**/route.ts)           │
│  thin: validate input → call a server module → return JSON    │
└───────────────┬──────────────────────────────────────────────┘
                │  import "server-only"
┌───────────────▼──────────────────────────────────────────────┐
│  Server modules  (src/lib/server/*)                          │
│  ai gateway · aiTasks · trends · news · scenario · coach ·    │
│  newsChat                                                     │
│      │                         │                              │
│      ▼                         ▼                              │
│  AI providers            Content adapters                     │
│  Groq/Gemini/Anthropic   HN · custom · Google News · GDELT ·  │
│  (env keys)              Reddit  (keyless)                    │
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
| `lib/shared` | isomorphic, pure | `date`, `stats`, `streak`, `srs`, `prompts` (the syllabus), `phrases`, `sparks`, `feedback` (offline). No I/O, no keys. |
| `lib/client` | browser only | `storage` (localStorage), `sound`, `clientApi` + `ai` (fetch our own API). |
| `lib/server` | server only (`"server-only"`) | `ai` gateway, `aiTasks` (prompt builders), `trends`, `news`, `scenario`, `coach`, `newsChat`. |

Because the stats/streak/SRS logic lives in `lib/shared`, it runs on the client
today and can move behind the API unchanged when Supabase lands.

### Routing & UI shells

Screens are real routes grouped by their chrome using App Router route groups:

- `app/(main)` — the tab-navigated shell (Home, Trending, Coach, News,
  Progress, Settings).
- `app/(session)` — brand-only chrome for the post-write flow (Celebrate,
  Feedback).
- `app/write` — the full-screen, chrome-less writing surface.

Ephemeral write-session flow (which prompt, the draft, timing) is threaded
through **`SessionFlowContext`**, not the URL. Durable on-device state (entries,
vocab, streak, settings) lives in **`StoreContext`**, persisted to
`localStorage`. `AppProviders` composes the providers plus the theme provider.

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

Higher-level prompt construction lives in `lib/server/aiTasks.ts` and the
feature modules (`coach.ts`, `scenario.ts`, `newsChat.ts`).

## Content adapters

Fetching third-party content server-side is what a backend is *for* here (CORS,
keys, caching, ToS isolation). Two adapter families, both keyless by default:

- **Trends** (`lib/server/trends.ts`): `fetchTrends()` fans out to Hacker News
  (Algolia front-page API) and an optional operator **`custom`** feed
  (`CUSTOM_TRENDS_URL`) — one interface, tolerant of individual failures. The
  `custom` slot is deliberately the single place a compliant social feed or paid
  trends API plugs in, isolating the ToS surface.
- **News** (`lib/server/news.ts`): `fetchNewsHeadlines()` fans out to Google
  News RSS, GDELT, and Reddit (`r/worldnews` et al.), dedupes, and returns a
  ranked list for News Chat's curation step. No keys required.

Route handlers cache these responses at the edge (`revalidate`), and a Vercel
Cron can warm them so the first user load is instant.

---

## API surface

All handlers are thin: validate → call a `lib/server` module → return JSON.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness. |
| `GET /api/trends` | Cached trends (HN + custom), edge-cached. |
| `POST /api/scenarios` | `{ trendId \| subject }` → a sectioned interactive scenario. |
| `POST /api/feedback` | Encouragement-first AI feedback for a finished entry. |
| `POST /api/prompts/generate` | Fresh, theme+level-grounded writing prompts. |
| `POST /api/sparks` | Tap-to-insert sentence starters for the writing surface. |
| `POST /api/coach` | Phrase Coach turn (SRS-scheduled phrase drilling). |
| `GET /api/news/subject` | Curate ONE live news subject + opening hook. |
| `POST /api/converse` | News Chat turn — the "forced production" engine. |
| `POST /api/converse/assist` | Stall help: a simpler question + tappable starters. |
| `POST /api/converse/recap` | Closing celebration + mined phrases → Coach/SRS. |

The News Chat contracts (`/api/news/*`, `/api/converse/*`) — subject curation,
the director prompt, stall assist, recap — are documented in detail in
[`NEWS_CHAT.md`](NEWS_CHAT.md).

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
you can write, build a streak, and see progress with no account. This is the
"defer signup until after a win" retention insight, and it means the core app
has zero backend dependencies.

**Next phase — Supabase:** real accounts and multi-device sync. Because the
stats/streak/SRS logic already lives in `lib/shared`, the migration is mostly
additive rather than a rewrite:

1. Add Supabase Auth (email magic-link + Google OAuth) with `@supabase/ssr`;
   keep the guest-first flow — a new visitor writes one session as a guest, then
   the celebrate screen invites sign-up to *save your streak*, and the guest's
   entry/vocab are claimed on signup.
2. Add a Postgres schema (SQL migrations under `supabase/`, Row-Level Security)
   for `entries`, `vocab`, streak/profile, and cached `trends`/`scenarios`.
   `supabase-js` from the server — no ORM, to avoid serverless
   connection-pool pain.
3. Move the currently-client stats/streak/vocab merge behind the API so they're
   consistent across devices and can't be tampered with. The client keeps light
   display helpers and swaps `localStorage` reads for API calls.

Caching stays table- and edge-based (`fetched_at`/TTL + `revalidate`), and
scheduled work stays on **Vercel Cron** — no long-running worker or Redis on the
free tier. Sharing generated scenarios/subjects across users (keyed by
trend/subject) is the main cost lever.

## Offline posture

Online-first, with a thin grace path. The **freewriting** loop works fully
offline (on-device feedback + curated syllabus). **Trending, Coach, and News
Chat require the network** — News Chat deliberately has no offline fallback
subject and fails honestly rather than faking content. Drafts live in
`localStorage` so a dropped connection mid-session never loses writing.

## Ops notes

- **Secrets** in Vercel env vars only; the `"server-only"` boundary keeps them
  out of the bundle.
- **Model choice** is per-task and configurable: a cheap fast model (e.g. Groq
  llama-3.3-70b) for real-time turns, a stronger one where adherence matters.
- **Cost control** is caching + short, per-user conversations + rate limits
  (added with the Supabase phase).
