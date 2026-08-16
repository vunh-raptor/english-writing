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
| Content sources | **Generated per learner and stored** — the word curriculum (`word_items`) and the listening passages (`listening_clips`) are written for the account that will meet them. Plus keyless server **news adapters** (Google News RSS, GDELT, Reddit) for the one mode that is about today. |
| Learner state | **Postgres, server-owned.** Read and written through `/api/state` as the signed-in user under RLS (`src/lib/server/db/state.ts`, `src/store/StoreContext.tsx`). Nothing durable on the device. |
| Auth + DB | **Supabase** (Postgres + Auth), and a hard dependency. Passwordless sign-in (magic link + Google) with `@supabase/ssr`; the middleware gates every page and API route. Schema in `supabase/migrations/` with RLS on every table — see [`../supabase/README.md`](../supabase/README.md). |
| Hosting | **Vercel** (Hobby). A Vercel Cron can warm the news cache. |

---

## Layers

The whole system is three layers inside one Next.js app.

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React, "use client")                               │
│  DailyWords · Respond · NewsChat · Phrasebook · Settings      │
│                       state: fetched from /api/state          │
└───────────────┬──────────────────────────────────────────────┘
                │  fetch() JSON  (src/lib/client/{clientApi,ai}.ts)
┌───────────────▼──────────────────────────────────────────────┐
│  Next.js Route Handlers  (src/app/api/**/route.ts)           │
│  thin: validate input → call a server module → return JSON    │
└───────────────┬──────────────────────────────────────────────┘
                │  import "server-only"
┌───────────────▼──────────────────────────────────────────────┐
│  Server modules  (src/lib/server/*)                          │
│  ai gateway · words · respond · extract · news · mission ·   │
│  phrasebook                                                   │
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
| `lib/shared` | isomorphic, pure | `date`, `stats`, `streak`, `srs`, `words` (day-set rules + the drill ladder + judging), `phrases` (drill methods + matchers), `respond` (the rung arc + the borrowing check), `transcribe` (dictation scoring, the word diff, chunking), `clips` (prose → timed cues), `prompt` (the prompt-composition kit + the learner snapshot's rendering), `modelJson` (reading a model's answer back). No I/O, no keys. |
| `lib/client` | browser only | `sound`, `clientApi` (fetch our own API), `supabase` (browser client), `player`/`speech` (chunk playback), `recorder` (shadow capture). |
| `lib/server` | server only (`"server-only"`) | `ai` gateway, `prompts/` (every system prompt, one module per surface), `request` (auth + the learner snapshot + the four route answers), `curriculum` (generating words), `listening` (generating passages), `words`, `respond`, `extract` (user-supplied URL fetching, with the SSRF guards), `news`, `mission`, `phrasebook`, `transcribe`, `supabase` + `db/`. |

Because the stats/streak/SRS logic lives in `lib/shared`, it moved behind the
API **unchanged** when state went server-side — `lib/server/db/state.ts` calls
the same `applyWrite`, `reviewCard` and `tokenize`. The Vitest suites over them
still cover the real logic, which is why this migration was a change of storage
rather than of behaviour.

### Routing & UI shells

Screens are real routes grouped by their chrome using App Router route groups:

- `app/(main)` — the shell every screen lives in: a persistent left rail on
  desktop (collapsing to a 72px icon strip), a top bar + bottom tab bar on
  mobile. Holds Daily words, Respond, News chat, Phrasebook and Settings.
- `/` redirects to `/words` — the day starts with today's words.

A mode's own session state (which round, the draft, timing) is local component
state, deliberately: a session is a single screen's concern and is never
resumable from a URL. Durable state (the lexical pool and its schedule, the
day's issued words, streak, vocabulary, saved sessions, settings) is held in
Postgres and reached through **`StoreContext`**, which loads it from
`/api/state` and dispatches every mutation there. `AppProviders` composes it
with the theme provider.

- `/sign-in` lives outside `(main)` — no rail, one job. `/auth/callback`
  exchanges the one-time code for a session (a route handler, because a Server
  Component cannot write cookies); `/auth/sign-out` is POST-only.

---

## The AI gateway

`src/lib/server/ai.ts` is a small provider-agnostic gateway:

- `resolveProvider()` picks the first configured provider in order Groq →
  Gemini → Anthropic, overridable with `AI_PROVIDER`. Models default sensibly
  and are overridable (`GROQ_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL`).
- `chatComplete(system, messages, maxTokens)` — multi-turn completion. Groq uses
  the OpenAI-compatible endpoint, Gemini its `generateContent` API, Anthropic
  the SDK. `rawComplete(system, user)` is the single-shot helper.
- `aiConfigured()` gates every route. It no longer selects between an AI path
  and a bundled one — there is no bundled one — so a missing key is a 503 that
  says so plainly.

### The prompt layer

Prompts used to be one long template literal per job, inlined in the engine
that called it. That is fine for one prompt and unmanageable for a dozen: the
injection rule drifted between them, the JSON contracts were formatted three
different ways, and there was nowhere to make a change that had to hold
everywhere. Three pieces replaced that:

| Piece | Where | Job |
| --- | --- | --- |
| The kit | `lib/shared/prompt.ts` | Pure composition: `section`, `bullets`, `numbered`, `dataBlock` (the only fence untrusted text enters through), `jsonContract` (one phrasing), and `renderSnapshot`. Isomorphic and unit-tested. |
| The texts | `lib/server/prompts/*.ts` | One module per surface, each exporting its system prompt, its user-half builder, and a `VERSION` string. Rules that must hold everywhere live once in `blocks.ts`. |
| The learner | `lib/server/db/context.ts` | `loadSnapshot()` — six narrow indexed reads, all capped, assembled into a `LearnerSnapshot`. Loaded **once per request** by `requestContext()` and passed down. |

`renderSnapshot(snapshot, facets)` is the efficiency lever: a judging call asks
for `["level"]`, the curriculum generator asks for the lot. Empty facets render
as nothing rather than as "none" — a line saying nothing still costs tokens and
still invites the model to comment on it.

A prompt's `VERSION` is stored alongside whatever it generated, so changing a
prompt invalidates its own cache instead of serving yesterday's shape.

### Where content comes from now

Nothing is bundled. Two generators mint durable material:

- **`lib/server/curriculum.ts`** — batches of ~12 words at a time, minted when
  the learner's queue drops below six unmet items. The learner's met words go
  in as an exhaustive exclusion list, and the one-word-per-semantic-field rule
  is checked in code rather than hoped for. Stored in `word_items`.
- **`lib/server/listening.ts`** — one passage per call, at the learner's band,
  about subjects they have engaged with. The model writes prose only; the cue
  timings are derived from it by `cueProse` at a stated speaking rate, because
  a model asked for timings returns a transcript and a clock that disagree.
  Stored in `listening_clips`.

Per-session material (a day's rounds, a practice session's situations, a
mission, a milestone) goes through `remember()` in `lib/server/db/generated.ts`:
read-through, keyed by what it is *for*, versioned by the prompt that built it.
That is what stops a reload changing the question someone is halfway through
answering, and it is also the record of what the app taught.

## Content adapters

Fetching third-party content server-side is what a backend is *for* here (CORS,
keys, caching, ToS isolation). One adapter family, keyless by default:

- **News** (`lib/server/news.ts`): `fetchNewsHeadlines()` fans out to Google
  News RSS, GDELT, and Reddit (`r/worldnews` et al.), dedupes, and returns a
  ranked list for News Chat's curation step. No keys required.

Route handlers cache these responses at the edge (`revalidate`), and a Vercel
Cron can warm them so the first user load is instant.

Daily words has no adapter either, but for a different reason than it used to:
its curriculum is generated, not fetched. `lib/shared/words.ts` now holds only
the *rules* — how a day's set is drawn, which drill rung a box earns, how a
production is judged — and takes the learner's catalogue as an argument
([`DAILY_WORDS.md`](DAILY_WORDS.md)).

`lib/server/extract.ts` is a different animal and is treated as one: it fetches
a URL chosen by the **user**, not by us, so it carries full request-forgery
guards — scheme allow-list, DNS resolution checked against private ranges,
manually-followed redirects revalidated per hop, and hard caps on time, size and
hops. See [`RESPOND.md`](RESPOND.md).

---

## API surface

All handlers are thin: validate → call a `lib/server` module → return JSON.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness. |
| `GET /api/state` | The signed-in learner's whole durable state. |
| `POST /api/state` | Apply one state action; returns the fresh whole store. Includes `recordProductions` (the writing ledger) and `saveNewsSession`. |
| `POST /api/words/daily` | The whole daily session: which words are due (topping the curriculum up if it is short) plus a round pack per word. Takes no body — the server owns the decision. |
| `POST /api/respond/source` | Pasted text or a user-supplied link → the readable article. No AI. |
| `POST /api/respond/questions` | A source → four questions climbing grasp → assume → push → extend. |
| `POST /api/respond/sharpen` | One harder question about the answer they just gave. |
| `POST /api/respond/ideas` | Are these angles theirs, or the source restated? |
| `POST /api/respond/polish` | Encouragement-first feedback on a finished piece. |
| `GET /api/news/mission` | Today's News Chat mission, planned against this learner's record and remembered per (account, day, level). |
| `POST /api/converse` | News Chat turn — the scene-partner engine (state merged in code). |
| `POST /api/converse/bridge` | "Say it your way": intent (any language) → keywords + gapped frame. |
| `POST /api/converse/continue` | "Next words": a stalled mid-sentence draft → next-word options + a gapped continuation frame. Never a completion. |
| `POST /api/converse/ask` | "Ask · anything": translate / explain / rephrase aide. |
| `POST /api/converse/debrief` | Closing debrief: per-target results, ≤2 upgrades, keep-phrases → SRS. |
| `POST /api/phrasebook/enrich` | A captured highlight → reusable form + meaning + transfer example. |
| `POST /api/phrasebook/drill` | One call per practice session: a real-life situation per due phrase. |
| `POST /api/phrasebook/judge` | Honest per-answer judgment: applied in their own sentence, or not. |
| `GET /api/transcribe/clips` | The learner's listening library, topped up by one passage if short. |
| `POST /api/transcribe/clips` | "Write me another" — always generates a fresh passage. |
| `POST /api/transcribe/chunks` | A pasted YouTube link → its captions as timed cues. No AI. |
| `POST /api/transcribe/explain` | The pattern behind a dictation's slips (the score itself is computed on-device). |
| `POST /api/transcribe/milestone` | A passage → two comprehension questions + two phrases to reuse. |
| `POST /api/transcribe/judge` | A milestone attempt, judged over a deterministic phrase-detection floor. |

The News Chat contracts (`/api/news/*`, `/api/converse/*`) — subject curation,
the director prompt, stall assist, recap — are documented in detail in
[`NEWS_CHAT.md`](NEWS_CHAT.md); the daily-word contract in
[`DAILY_WORDS.md`](DAILY_WORDS.md) and the Respond contract in
[`RESPOND.md`](RESPOND.md).

## Prompt-injection posture

Crawled titles, snippets, and everything the learner types are treated as
**untrusted data, never instructions**. The system prompts state this
explicitly, we pass third-party text as clearly-delimited content to write
about, and nothing from it is ever executed. Structured JSON contracts are kept
tiny (a handful of fields) for reliability on fast free-tier models; parsing
fails soft so a bad response never breaks the writing flow.

---

## State today, and the Supabase phase

**Today:** all durable state lives in Postgres, per account, behind RLS. The
app is **account-only**: `src/middleware.ts` bounces an unauthenticated page
request to `/sign-in` and answers an unauthenticated API call with 401, and
`src/lib/client/storage.ts` no longer exists.

The trade this made, stated plainly: the app previously ran **guest-first**, on
the "defer signup until after a win" retention insight, and the core loop worked
with no account and no network. That is gone. Sign-up now precedes the first
win. Multi-device sync, a learner not losing everything to a cleared browser,
and state that can be trusted server-side were judged worth it — but the
retention cost is real, and anyone revisiting this should weigh it rather than
discover it.

**How it is wired.** Migrations `0001`–`0006` under `supabase/` cover the whole
of `Store`: `profiles` (streak, totals, rolling level, the two Settings dials),
`phrases` (the shared library, its Leitner schedule, and the learner's own line
per item), `news_sessions`, `respond_sessions`, `transcribe_sessions`, plus
`vocab` and the day-keyed tallies `word_days` and `phrase_applied`. Every table
has RLS with `to authenticated` **and** an ownership predicate, and `with check`
on every insert and update so a row can never be written or reassigned to
another account. `supabase-js` from the server, no ORM, to avoid serverless
connection-pool pain. See [`../supabase/README.md`](../supabase/README.md).

Reads and writes go through `src/lib/server/db/state.ts` using the
**request-scoped** client (`supabaseServer()`), never the admin client — so RLS
is what enforces ownership rather than a `where` clause someone has to remember.
Every mutation returns the whole fresh store, because one clean production moves
the schedule, the streak and the day's tally at once, and a client
reconstructing that from a patch would eventually disagree with the database.

Migration `0007` completed the picture, and changed what "durable state" means:
the **curriculum itself** is now learner data. `word_items` holds the words
generated for this account, `listening_clips` the passages, `ai_content` the
per-session material keyed by what it was generated for, and `productions`
every sentence the learner has written with the ask that drew it out and the
verdict it earned.

That last one closed the app's oldest gap. Until it existed, a session left
behind only its *consequences* — a Leitner box moved, a streak advanced, a
counter incremented — and the sentences themselves were thrown away. They are
the record now, and they are also what every generation prompt reads.

**What is still open:**

1. **A guest-to-account import.** There is none: anyone with progress in an old
   browser blob starts fresh. Adding a one-time read-and-upload on first sign-in
   is small, and would cost nobody their streak.
2. **E2E coverage of the learner journeys**, which needs a Supabase project or a
   seeded local stack in CI — see `e2e/account-gate.spec.ts`.
3. **Nothing surfaces the production ledger to the learner yet.** It is loaded
   into the store and read by every prompt, but there is no "everything you have
   written" screen, which is the obvious thing to build on top of it.
4. **Generation cost is per-account.** Missions used to be planned once per
   (day, level) and shared; they cannot be shared now that the plan reads the
   learner's own due items and chosen subjects. Batching the curriculum (twelve
   words per call, so one call covers a fortnight) is the main lever that
   remains.

Caching stays table- and edge-based (`ai_content` + `fetched_at`/TTL +
`revalidate`), and scheduled work stays on **Vercel Cron** — no long-running
worker or Redis on the free tier.

## Availability posture

There is no offline story left, and that is the deliberate trade this
architecture made twice.

The first trade moved learner state to Postgres: nothing durable lives on the
device, so every mode needs the network. The second removed the bundled
content: the word curriculum and the listening passages are generated per
learner, so every mode needs a **provider key** as well as a network.

What that costs, stated plainly:

- **A provider outage is a session nobody can start.** Daily Words and
  Transcribe used to run on a train with no key at all. They do not now.
- **Free-tier rate limits are visible to learners.** A 502 from a rate-limited
  provider is a real error on a real screen; retrying is what a user does.

What it buys: a curriculum that never repeats a word someone knows, never runs
out after a few hundred days, and can lean on what the learner has actually
written. The bundled list could do none of those things.

Every surface fails the same way as a result — honestly, with a retry, and
never by substituting material that fits nobody in particular:

- **Daily Words** says it could not build today's words. The alternative was
  ten generic moments ("a friend asks how your week is going") that fit any
  word and elicit none.
- **The Phrasebook's** Mixed mode says it could not build the rounds. Recall,
  Sprint and Study still run: they use the learner's *own stored material*,
  which is theirs rather than pre-written.
- **Respond** surfaces a failed ladder rather than falling back to four generic
  rungs, and a failed polish rather than a canned celebration that praises a
  word count it computed instead of the writing it never read.
- **Transcribe** keeps its deterministic half — the score, the diff and the
  missed-word list are computed on-device from the stored transcript — but the
  milestone that closes a passage is generated per passage or not at all.
- **News Chat** is unchanged: it was always inherently online, and always
  failed honestly rather than faking today's news.

## Ops notes

- **Secrets** in Vercel env vars only; the `"server-only"` boundary keeps them
  out of the bundle.
- **Model choice** is per-task and configurable: a cheap fast model (e.g. Groq
  llama-3.3-70b) for real-time turns, a stronger one where adherence matters.
- **Cost control** is caching + short, per-user conversations + rate limits
  (added with the Supabase phase).
