# Architecture patterns: Next.js fullstack vs. module-driven vs. feature-driven

Flowrite is built as a **Next.js fullstack app** — one deployable where UI, API,
and server logic are colocated and organized by the framework's file conventions
(by *technical layer*: `app/`, `components/`, `lib/`, `store/`). This doc weighs
that choice against two alternatives, **for this app specifically**:

- **Module-driven** — decompose the *backend* into cohesive modules (often its
  own service or monorepo package), each owning its routes, services, and data
  access, wired explicitly (NestJS-style modules + DI).
- **Feature-driven** — organize the *whole codebase* into vertical feature
  slices (Feature-Sliced Design / vertical-slice architecture): everything a
  feature needs — its UI, hooks, API calls, server logic, types — lives in one
  folder, instead of being spread across layer folders.

> TL;DR — **Stay on the Next.js fullstack pattern.** It fits Flowrite's shape:
> UI-heavy, AI-proxying, light domain logic, one client, cron-only background
> work, small team, free tier. The two alternatives answer *different* questions:
> module-driven is about **deployment topology + backend decomposition** (not
> needed yet), while feature-driven is about **how you slice folders** (a
> reasonable *internal* evolution as the app grows — and adoptable without
> changing the deploy). Flowrite already borrows the best of both: `lib/server`
> is split into cohesive modules today.

---

## Two independent axes

The three patterns are easy to conflate because "module" and "feature" sound
alike. They actually live on **two independent axes**:

- **Topology** — one deployable (fullstack) **vs.** a separate backend service.
- **Code organization** — group by **technical layer** **vs.** group by
  **feature/vertical slice**.

|  | Organized by **layer** | Organized by **feature** |
| --- | --- | --- |
| **One app** | **Next.js fullstack — current** | **Feature-driven** (inside Next.js) |
| **Separate backend** | Classic layered API | **Module-driven** backend |

So "feature-driven" is not the opposite of "fullstack" — you can (and Flowrite
partly does) apply feature-driven organization *inside* the single Next.js app.
"Module-driven" mainly buys you the second row: an independently deployable,
DI-wired backend.

---

## The three patterns

### 1. Next.js fullstack, layer-organized (current)

One Next.js App Router app. Routes are files (`app/**/page.tsx`,
`app/api/**/route.ts`); server logic lives in `src/lib/server/*` behind an
`import "server-only"` boundary; the client fetches its own `/api/*`. One repo,
one deploy (Vercel), shared TypeScript types across the wire for free. Folders
are **technical layers**.

```
src/
  app/          UI routes + api/**/route.ts   (thin handlers)
  components/   all UI, grouped by kind (ui/ primitives + feature components)
  lib/
    shared/     isomorphic pure logic + types (shared client↔server)
    client/     browser-only
    server/     server-only modules: ai, coach, scenario, news, trends…
  store/        cross-cutting contexts
```

### 2. Module-driven backend

The API becomes its own thing — a standalone service or a monorepo package —
structured as vertical modules, each self-contained and wired by a framework:

```
apps/
  web/                     Next.js (or Vite) UI, talks to the API over HTTP
  api/
    modules/
      writing/    { controller, service, repository, dto }
      coach/      { controller, service, repository, dto }
      news/       { controller, service, repository, dto }
      trends/     { … }
      ai/         provider gateway (shared)
      auth/       { … }
packages/
  shared/         DTOs / validation schemas shared by web + api
```

Each module declares its dependencies explicitly and exposes a narrow surface;
DI wires them. Chief benefit: hard, enforced boundaries and an API that is a
first-class product (consumable by non-web clients). Chief cost: a second deploy
and a cross-the-wire seam to maintain.

### 3. Feature-driven (vertical slices, inside Next.js)

Same single deploy, but folders are **features, not layers**. `app/` stays as
thin routing shells (Next.js requires routes there); everything else a feature
owns is colocated under `src/features/<feature>/`:

```
src/
  app/                     thin route shells only:
    (main)/news/page.tsx   →  import { NewsChatPage } from "@/features/news"
    api/converse/route.ts  →  import { converse } from "@/features/news/server"
  features/
    news/                  # News Chat, end to end
      components/          NewsChat.tsx, SubjectCard.tsx …
      server/              news.ts, newsChat.ts (converse/assist/recap)
      hooks/  api.ts  types.ts
    words/                 # Daily words, end to end
    phrasebook/  settings/
  shared/                  cross-feature: ai gateway, ui/ primitives,
                           date/stats/streak/srs, store contexts
```

Chief benefit: **colocation** — a feature is one folder; you can read, change, or
delete it without spelunking across `components/`, `lib/`, and `app/`. Chief
cost: it cuts against Next.js's layer-shaped conventions (`app/`, `components/`,
`lib/server`) and needs a discipline call on what's truly "shared."

---

## Side-by-side

| Dimension | Next.js fullstack (current) | Module-driven backend | Feature-driven (in Next.js) |
| --- | --- | --- | --- |
| **Primary axis** | Topology: one app. | Topology: separate backend. | Organization: slice by feature. |
| **Deploy units** | One (Vercel). | Two+ (web + api, maybe worker). | One (Vercel). |
| **Folder grouping** | By technical layer. | By backend module. | By product feature. |
| **Colocation of a feature** | Spread across `app`/`components`/`lib`. | Backend part cohesive; UI still separate. | Everything in one `features/<x>` folder. |
| **Type safety across the wire** | Free — same TS project. | Needs a shared package + discipline. | Free — same TS project. |
| **Boundary enforcement** | Convention (`server-only`, `lib/*`); can blur. | Strong — module system + DI. | Convention + `server-only`; "shared" needs care. |
| **Non-web consumers** (mobile, CLI) | Awkward — API coupled to web app. | Natural — API is a product. | Still awkward — same single app. |
| **Background/long jobs** | Serverless + Vercel Cron only. | Persistent workers, queues. | Serverless + Vercel Cron only. |
| **Onboarding / "where's the code?"** | Learn the layer map. | Two processes to run. | Intuitive — follow the feature name. |
| **Refactor within a feature** | Touches several layer folders. | Backend side is local; UI is elsewhere. | One folder. |
| **Cost on free tier** | Excellent. | Higher — separate host, likely paid worker. | Excellent. |
| **Fit for large teams** | Tangles as it grows. | Clear ownership seams. | Clear per-feature ownership, one repo. |

---

## What actually drives the decision *for Flowrite*

Score the app against what each alternative pays off for:

| Factor | Flowrite reality | Points to |
| --- | --- | --- |
| **Where complexity lives** | In the **UI and the prompts**, not domain rules. Handlers are thin: validate → call a `lib/server` module → return JSON. | Fullstack |
| **API consumers** | Exactly one: this web app. No mobile/partner/CLI. | Fullstack (not module) |
| **Domain invariants** | Light — stats/streak/SRS are pure functions in `lib/shared`; no transactional workflow. | Fullstack (not module) |
| **Background work** | Only periodic cache warming → Vercel Cron. No queues/long jobs. | Fullstack (not module) |
| **UI ↔ AI coupling** | Very tight — prompt, response shape, and UX iterate together. | Fullstack + feature |
| **Feature count & churn** | A handful of distinct modes (daily words, news chat, phrasebook) that each span UI + API + server. | Leans **feature** |
| **Team size / cost** | Small; free-tier target. | Fullstack |
| **Data layer** | Not even wired (localStorage today; Supabase next). | Fullstack (not module) |

Every axis that would justify a **module-driven backend** points the other way:
one client, light domain logic, cron-only work, small team, free tier. That
pattern buys separation this app doesn't need yet.

The one signal with real pull is **feature churn**: modes like News Chat already
span `NewsChat.tsx` + `api/converse/*` + `api/news/*` + `lib/server/{news,
newsChat}`. That spread is exactly what feature-driven organization tidies — and
it's adoptable *without* changing the deploy.

---

## Flowrite already blends the best of both

The valuable idea in module-driven design isn't "separate service" — it's
**cohesive modules with clear boundaries.** Flowrite already applies that
*inside* the Next.js app:

- `lib/server/{coach,scenario,news,trends,newsChat}.ts` are cohesive feature
  modules; `lib/server/ai.ts` is the shared gateway they depend on.
- `lib/shared` is the isomorphic core (pure logic + types), `lib/client` is
  browser-only, and `import "server-only"` is a hard boundary keeping secrets
  and provider code out of the bundle.
- Route handlers stay thin, so the modules — not framework glue — hold the logic
  and stay unit-testable.

That is module discipline **without** the separate deploy. Moving to
feature-driven would extend the same instinct to the *UI* side, colocating each
mode's components with its server module.

A light rule of thumb keeps either style honest: a route handler only parses
input and calls one module; features don't import each other's internals (go
through `shared`); anything with a secret stays under `server-only`.

---

## Recommendation

**Stay on the Next.js fullstack pattern** — it matches Flowrite's shape today,
and neither alternative changes that verdict on its own:

- **Do not adopt a module-driven backend yet.** It solves problems Flowrite
  doesn't have (multiple clients, heavy domain logic, non-serverless workloads).
  Revisit only when a real threshold is crossed (see below).
- **Consider feature-driven organization as an *internal* evolution**, not a
  rewrite. If the layer split starts to hurt — you keep touching four folders to
  change one mode — introduce `src/features/<feature>/` incrementally: keep
  `app/**` as thin shells that import from a feature, move that mode's
  components + `lib/server` module + hooks/types into its folder, and reserve
  `src/shared` for genuinely cross-feature code (the AI gateway, ui/ primitives,
  stats/streak/srs, store contexts). It's a low-risk, file-move refactor with
  the same deploy. Start with the busiest mode (News Chat) and only spread it if
  it earns its keep.

**Revisit the module-driven backend only when** any of these becomes true:

1. **A second first-class client** appears (native mobile, a public/partner API,
   a CLI) that must share the same backend.
2. **Domain logic gets heavy** — real transactional workflows and invariants
   deserving a tested layer independent of the web framework.
3. **You need work serverless can't host** — persistent connections, long
   crawls/queues beyond a daily cron, or workloads past function limits.
4. **Team/ownership pressure** — enough contributors that independent deploy
   cadences and clear module ownership outweigh the cost of a split.

If that day comes, whichever internal style you're in makes extraction cheap:
`shared` becomes a shared package, each server feature module becomes a backend
module, and the thin route handlers become the API's controllers. Feature-driven
organization makes that lift-out even cleaner, because each backend module is
already sitting in its feature folder. Designing for that seam now — without
paying for it yet — is the right call.
