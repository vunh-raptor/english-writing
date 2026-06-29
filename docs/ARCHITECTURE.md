# Flowrite — Full-Stack Architecture

> Status: **proposal**. This documents the move from the current browser-only,
> local-first app to an online-first full-stack app with a backend. It's written
> to be executed in phases, each of which keeps the app shippable.

## Why switch

The new product vision breaks the browser-only model on every axis:

| New requirement | Why a backend is required |
| --- | --- |
| Trending subjects from the web / social platforms | Crawling/fetching needs server-side requests (no CORS), API keys kept secret, caching, and scheduled jobs. Browsers can't do this safely or legally. |
| AI scenario generation, feedback, word help | The provider key must live server-side, not in the browser. Enables caching (share generated scenarios across users), rate limits, and cost control. |
| Real personalization & multi-device | Progress, vocabulary, and streaks become server state in a database, synced across devices. |
| "Interesting, current" content | A worker pre-fetches trends on a schedule so the client gets fresh subjects instantly. |

So: **online-first**, with a thin offline grace path (see *Offline posture*).

---

## System overview

```
                       ┌─────────────────────────────┐
   Browser (React SPA) │  apps/web                   │
   - calm writing UX   │  - React + TS + Vite        │
   - scenario flow     │  - TanStack Query (server   │
   - word panel        │    state) + auth session    │
                       └──────────────┬──────────────┘
                                      │ HTTPS / JSON (REST)
                       ┌──────────────▼──────────────┐
                       │  apps/api  (Node + TS)       │
                       │  - auth, settings            │
                       │  - entries, progress, vocab  │
                       │  - trends, scenarios         │
                       │  - feedback, word help       │
                       │  - AI gateway (keys here)    │
                       └───┬───────────┬───────────┬──┘
                           │           │           │
                 ┌─────────▼──┐  ┌─────▼─────┐  ┌──▼─────────────┐
                 │ PostgreSQL │  │  Redis    │  │ apps/worker    │
                 │ (Prisma)   │  │ cache +   │  │ - cron crawls  │
                 │ users,     │  │ job queue │  │ - pre-generate │
                 │ entries,   │  │ (BullMQ)  │  │   scenarios    │
                 │ trends, …  │  └───────────┘  └───┬────────────┘
                 └────────────┘                     │
                                        ┌───────────▼────────────┐
                                        │ Trend adapters         │
                                        │ HN · Reddit · GTrends  │
                                        │ YouTube · CUSTOM slot  │
                                        └────────────────────────┘
                                        ┌────────────────────────┐
                                        │ AI providers           │
                                        │ Anthropic/Gemini/Groq/ │
                                        │ OpenAI-compatible      │
                                        └────────────────────────┘
```

### Components

1. **`apps/web`** — the existing Vite React client, refactored to read/write
   through the API instead of `localStorage`. The calm writing UX, the
   sectioned scenario flow, and the word panel all stay.
2. **`apps/api`** — REST/JSON server. Owns auth, persistence, and **all AI and
   crawling** (keys live here, never in the browser).
3. **PostgreSQL** (via **Prisma**) — durable state: users, entries, vocabulary,
   streaks, trends, scenarios.
4. **Redis** — caches trends and generated scenarios; backs the **BullMQ** job
   queue; per-user rate limiting.
5. **`apps/worker`** — scheduled jobs: fetch trends on a cron, pre-generate
   scenarios for hot trends, nightly cleanup.
6. **Trend adapters** — pluggable, legitimate sources (Hacker News, Reddit,
   Google Trends, YouTube) **plus a `custom` adapter** — the slot where a
   compliant TikTok/IG/FB/Threads feed (your own crawler or a paid trends API)
   plugs in. Keeping social crawling behind an adapter the operator supplies is
   deliberate: it isolates the ToS/compliance surface to one place.
7. **AI gateway** — the server-side version of the provider layer already built
   in `src/lib/ai.ts`, with keys from env, response caching, retries, and
   prompt-injection-safe handling of crawled text.

---

## Recommended stack

**Primary recommendation: a TypeScript monorepo that keeps the current client.**
The client we've built is polished; this preserves it and adds a backend cleanly.

| Concern | Choice | Why |
| --- | --- | --- |
| Monorepo | **pnpm workspaces + Turborepo** | One repo, shared types, fast CI. |
| Frontend | **Existing Vite + React + TS** | Keep the work; add TanStack Query for server state. |
| API | **Fastify + TS** (or NestJS if you want batteries/structure) | Fast, typed, simple; great with Zod. |
| Validation / shared types | **Zod** in `packages/shared` | One source of truth for request/response shapes, shared by client and server. |
| DB | **PostgreSQL + Prisma** | Typed schema + migrations. |
| Cache / queue | **Redis + BullMQ** | Trend caching + scheduled crawls. |
| Auth | **Lucia** or **Auth.js** (email magic-link + Google OAuth) | Sessions/JWT; see *Auth*. |
| AI | Reuse provider layer, server-side | Keys in env; add caching + limits. |
| Deploy | **Web → Vercel/CDN**; **API + worker → Fly.io / Render / Railway**; **Postgres → Neon**; **Redis → Upstash** | Managed, cheap to start. |

**Alternative: consolidate into Next.js (App Router).** One framework, route
handlers + server actions, simplest single deploy (Vercel). Trade-off: more
rework of the current Vite client (routing, data fetching, file layout), and you
still want a separate long-running **worker** for cron crawls (serverless cron
is fine for light schedules). Choose this if you'd rather have one app than a
client+API split.

> Recommendation: **monorepo + Fastify API** to preserve the client and keep the
> crawling/worker concerns cleanly separated. Pick Next.js only if a single
> unified app matters more than reusing the current frontend as-is.

### Proposed monorepo layout

```
flowrite/
  apps/
    web/        # current Vite React app (moved here)
    api/        # Fastify server: routes, services, AI gateway
    worker/     # BullMQ workers + cron (trend ingestion, pre-gen)
  packages/
    shared/     # Zod schemas + shared TS types (Entry, Trend, Scenario, …)
    db/         # Prisma schema, client, migrations
    ai/         # provider layer (Anthropic/Gemini/Groq/OpenAI) used by api+worker
    trends/     # trend adapters (hn, reddit, gtrends, youtube, custom)
  docs/
```

---

## Data model (Prisma sketch)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String?
  createdAt    DateTime @default(now())
  settings     Json     // goalType, goalValue, difficulty, focuses, trendSources…
  // streak / profile (1:1 fields kept inline for simplicity)
  streak       Int      @default(0)
  longestStreak Int     @default(0)
  lastWriteDay String?  // 'YYYY-MM-DD' local-day key
  freezes      Int      @default(2)
  totalWords   Int      @default(0)
  totalEntries Int      @default(0)
  totalMs      Int      @default(0)
  entries      Entry[]
  vocab        VocabWord[]
}

model Entry {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  day         String   // local-day key
  createdAt   DateTime @default(now())
  subject     String   // prompt text or trend subject
  source      String   // 'curated' | 'ai' | 'trend'
  scenarioId  String?
  text        String
  words       Int
  chars       Int
  sentences   Int
  newWords    Int
  durationMs  Int
  @@index([userId, day])
}

model VocabWord {
  id        String @id @default(cuid())
  userId    String
  word      String
  firstSeen String // local-day key
  count     Int    @default(1)
  @@unique([userId, word])
}

model Trend {
  id        String   @id @default(cuid())
  source    String   // 'hn' | 'reddit' | 'gtrends' | 'youtube' | 'custom'
  platform  String   // display label
  title     String
  url       String?
  blurb     String?
  score     Float    @default(0)
  fetchedAt DateTime @default(now())
  @@index([source, fetchedAt])
}

model Scenario {
  id        String   @id @default(cuid())
  trendId   String?
  subject   String
  source    String
  intro     String
  steps     Json     // ScenarioStep[]
  createdAt DateTime @default(now())
  @@index([subject])
}

// + auth tables (Session/Account) per the chosen auth library
```

Generated **scenarios are cached and shared** across users (keyed by trend/
subject) — repeated picks are instant and cheap.

---

## API surface (REST, all JSON, Zod-validated)

```
POST   /auth/magic-link            # request login email
GET    /auth/callback              # verify, set session cookie
POST   /auth/logout
GET    /me                         # current user + profile
GET    /me/settings    PUT /me/settings
GET    /me/progress                # summary, calendar, vocab growth

GET    /prompts?level=&focus=      # curated syllabus (+ optional AI personalization)

GET    /trends?sources=            # cached trends (from worker)
POST   /scenarios                  # body: { trendId } | { subject } -> Scenario (cached)
GET    /scenarios/:id

POST   /entries                    # save a finished session; server updates streak/vocab/totals
GET    /entries     GET /entries/:id
POST   /entries/:id/feedback       # AI feedback (server-side key)

POST   /words/help                 # { word, subject } -> meaning + in-context examples
POST   /words/check                # { word, subject, sentence } -> quick encouraging note
```

Server owns the logic that currently lives in the client: `stats`, `streak`
(`applyWrite`), and vocabulary merging move into `apps/api` services so they
can't be tampered with and are consistent across devices.

---

## Feature mapping

### Trending → sectioned interactive scenarios
- **Worker** runs trend adapters on a cron (e.g. hourly), normalizes + dedupes,
  writes to `Trend` + Redis. Adapters: HN (Algolia), Reddit (OAuth app),
  Google Trends (daily RSS), YouTube (Data API), and the **`custom`** adapter
  (operator-supplied endpoint = where compliant TikTok/IG/FB/Threads data plugs
  in).
- Client `GET /trends` → instant from cache. Pick one → `POST /scenarios` →
  server generates (AI) a **sectioned, interactive** scenario — a small ordered
  set of beats (react in one line → take a side → reply to a comment → imagine
  your post…), each a tiny freewrite that builds engagement in the subject.
  Cached so it's reusable.
- **Prompt-injection hygiene:** crawled titles/snippets are passed to the model
  as clearly-delimited *untrusted content to write about*, never as instructions.

### In-context word practice
- While writing, selecting a word opens a calm **slide-in panel** (bottom sheet
  on mobile). `POST /words/help { word, subject }` returns a plain-language
  meaning + 1–2 example sentences **in the scenario's subject**, then a micro
  "use it in a sentence about {subject}" exercise checked via `POST /words/check`.
- A free dictionary API gives a baseline meaning even before AI; AI adds the
  in-context examples. Opt-in, dismissible — never interrupts the writing flow.

### Feedback
- Moves server-side (`POST /entries/:id/feedback`). No browser key. Same
  encouragement-first contract; cached per entry.

---

## Auth & the "defer signup" insight

The retention research says: let users get a first win **before** asking them to
sign up. We keep that:

1. A new visitor can write one session as a **guest** (server issues an anonymous
   session id; the entry is stored against it).
2. On the celebrate screen, prompt to create an account to **save your streak**.
3. On signup, the guest's entry/vocab are claimed into the new user.

Auth: email magic-link (low friction) + Google OAuth. Session cookie (HTTP-only,
SameSite) or JWT.

---

## Offline posture (no longer offline-first, but graceful)

- The app **assumes connectivity**. Trends, scenarios, feedback, and word help
  require the API.
- Grace, not full offline: cache the last fetched trends/scenario and the
  in-progress draft in `localStorage` so a dropped connection mid-session
  doesn't lose writing; sync the entry when back online. This is a safety net,
  not a feature.

---

## Cost & ops

- **Caching is the cost lever:** scenarios are generated once per trend and
  shared; feedback cached per entry; trends fetched on a schedule, not per
  request. Add per-user rate limits (Redis).
- **Secrets** in env/secret manager. **Observability:** structured logs with
  request IDs, error tracking (Sentry), basic metrics.
- **Model choice** server-side: a cheaper model (e.g. Haiku) for high-volume
  word help / feedback; a stronger model for scenario generation. Configurable.

---

## Migration plan (incremental; each phase ships)

| Phase | Work | Outcome |
| --- | --- | --- |
| **0. Monorepo** | Move app → `apps/web`; create `packages/shared` (Zod types), `packages/db` (Prisma); Turborepo + pnpm. | Same app, new structure, still builds. |
| **1. API + persistence** | Fastify API; Postgres; auth + `/me` + settings + `/entries` + `/me/progress`. Move `stats`/`streak`/`vocab` to server. Client swaps `localStorage` for an API client (TanStack Query). Guest→account flow. | Real accounts, multi-device, server-side progress. |
| **2. Server-side AI** | Move `lib/ai.ts` to `packages/ai`; `/entries/:id/feedback` + `/words/help` + `/words/check`. Remove browser keys. | Feedback + word practice without browser keys. |
| **3. Trends + scenarios** | `packages/trends` adapters; `apps/worker` cron; `/trends` + `/scenarios`. Trending UI + sectioned scenario write flow. | Trend-driven, interactive scenarios. |
| **4. Word panel UX** | Slide-in/bottom-sheet panel wired to `/words/*`. | In-context word practice. |
| **5. Hardening** | Rate limits, caching, Sentry, deploy pipelines, seed data. | Production-ready. |

### What changes in today's client code
- `src/lib/storage.ts` → an `apiClient` + TanStack Query hooks.
- `src/store/StoreContext.tsx` → auth/session context; server state via queries.
- `src/lib/ai.ts` → moves to `packages/ai` (server). Client calls endpoints.
- `src/lib/{stats,streak}.ts` → logic moves server-side (client keeps light
  display helpers). Curated syllabus (`prompts.ts`) can stay client-side or move
  behind `/prompts`.
- Settings: provider keys leave the browser. Either operator-configured
  server-side, or per-user keys stored **encrypted** server-side (a product
  choice).

---

## Open decisions

1. **Stack:** monorepo + Fastify API (recommended) **vs** consolidate into
   Next.js.
2. **Auth provider:** roll-your-own (Lucia/Auth.js) **vs** managed (Clerk,
   Supabase Auth) for speed.
3. **AI keys:** operator-funded server keys (simplest UX, you pay) **vs**
   per-user encrypted keys (users pay, more plumbing).
4. **Hosting target:** Fly/Render/Railway **vs** Vercel + managed services.
5. **Social trends source:** which compliant feed backs the `custom` adapter
   (your own crawler vs a paid trends API).
