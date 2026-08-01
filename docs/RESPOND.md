# Respond — read something, then say something back

The mode where **the learner brings the English**. They hand over a post, an
article, a newsletter, a thread — anything they were already reading — and the
app hands back only *questions*, until they have an angle of their own and
write it.

Route `/respond`.

---

## The one rule

> **The app asks. The learner answers. Never the other way round.**

Nothing in this mode ever produces a summary, an opinion, an angle, or a line
the learner could paste. That isn't a stylistic preference — it's the whole
design. A mode that hands back the model's thinking lets someone finish a
session having produced nothing, which is the exact failure this app exists to
avoid. Every system prompt in `lib/server/respond.ts` states it, and the code
enforces what it can: a "question" that isn't interrogative is dropped
(`looksLikeQuestion`), and the angle screen's only "suggestions" are the
learner's own earlier answers, quoted back.

## The research, and what we concluded from it

| Finding | What it settles | Where it lives here |
| --- | --- | --- |
| **Integrated (source-based) writing pulls different language.** Compared with independent prompts, responses to a source differ in lexical sophistication and syntactic complexity, and **phraseological** features predict quality noticeably more strongly. | Reading before writing feeds the *chunks* — the collocational, formulaic language that independent prompts don't pull. This complements Daily Words rather than duplicating it. | The whole mode: nobody writes here without having read first |
| **Source-based writing has one documented failure: borrowing.** Novice L2 writers struggle to paraphrase and integrate, and lift the source's wording — a well-studied problem in integrated-writing assessment. | If we don't test for it, the mode quietly rewards parroting. | **The borrowing check** — every angle is measured against the source before it can be drafted |
| **Elaborative interrogation & self-explanation** (Dunlosky et al. 2013, *moderate* utility): generating *why* a thing is true, and relating it to what you already know, beats re-reading. | Questions beat commentary. The learner has to generate the explanation. | The four-rung ladder, and "Push me" — one harder question about what they just wrote |
| **Bloom's revised taxonomy** tops out at *create*. | A comprehension quiz stops one level too early. The ladder has to end somewhere generative. | The rungs climb understand → analyse → evaluate → **create**, and the last rung's answer is the raw material for their own piece |
| **Output hypothesis** (Swain): producing forces you to notice what you can't yet say. | The session must end in a real piece, not a discussion. | The draft, and the polish after it |

Honest caveats, in the project's usual style: the integrated-vs-independent
literature does **not** show one task type universally producing better writing
— it shows they're different, which is why this mode sits alongside the others
rather than replacing them. And elaborative interrogation is rated *moderate*
utility, not high; it's promising rather than settled.

## The flow

```
/respond
  PASTE the text, or GIVE A LINK we fetch and extract
  → POST /api/respond/source   (no AI — pasting works with no provider key)

READ    the source stays available the whole session, collapsible.
        Highlight anything → it goes to your Phrasebook (SelectionCapture,
        the same affordance the News Chat manuscript has).

THINK   four questions, one per rung, grounded in this specific source
        → POST /api/respond/questions   (fails → the generic ladder, which is
          made of real questions, so the ladder always runs)

          grasp   say it back in your own words        (understand)
          assume  name what it takes for granted       (analyse)
          push    weigh it against what you've seen    (evaluate)
          extend  find who it left out                 (create)

        "Push me" buys ONE harder follow-up about the answer they just gave
        → POST /api/respond/sharpen   (fails → "What makes you say that?",
          the safest push and still the highest-value one)

ANGLES  their four answers laid out on the left as raw material — the only
        thing this screen ever "suggests" is the learner's own thinking.
        Three slots: a hook and up to three bullets each, all written by them.
        → POST /api/respond/ideas → own / still-the-article's, per idea

DRAFT   one idea becomes a ~120-word piece. Their outline is visible but
        inert — nothing here completes their turn, as everywhere else.

POLISH  → POST /api/respond/polish — what landed (quoting them), at most two
        upgrades, and phrases from THEIR OWN draft worth keeping. Tap one and
        it joins the Phrasebook.

Undrafted angles stay in the IDEA BANK on the home screen.
```

### The borrowing check

The one mechanic that makes this more than a chat wrapper. Every angle is
measured against the source **in code**, before any model sees it
(`checkBorrowing`, `lib/shared/respond.ts`):

- The candidate and the source are reduced to 6-word windows.
- If more than 20% of the candidate's windows also appear in the source, it's
  the article talking, not the learner.
- The longest verbatim run is reported back — *"Lifted from the article: …"* —
  so the feedback is specific rather than a scolding.

It measures **wording, not meaning**. Agreeing with a piece is completely fine;
saying it in the piece's own words is what hollows the exercise out.

The model can *tighten* this verdict but never loosen it: an idea is "yours"
only if the deterministic check **and** the model both say so. That's the mirror
of the judging elsewhere in the app, where code can only ever *rescue* a real
production — here, code can only ever *catch* a borrowed one. In both cases the
asymmetry runs in the direction that protects the learner from a lazy model.

Because the check is local, this route needs no AI key at all: with no provider
configured it still returns a real verdict.

## Links, and the guards they need

Link-fetching is the only place in the app that fetches a URL chosen by the
*user*, so it's the only place that needs request-forgery guards
(`lib/server/extract.ts`):

- **http/https only** — no `file:`, no `gopher:`, no `data:`.
- **The resolved address must be public.** Hostnames are resolved with
  `dns.lookup` and the result checked, so a public-looking name pointing at
  loopback is refused. Private, loopback, link-local (including the cloud
  metadata address `169.254.169.254`), carrier-grade NAT, multicast, IPv6
  unique-local, NAT64, and **IPv4-mapped IPv6** are all rejected.
- IPv6 is expanded to its eight groups before judging, because the textual
  forms aren't comparable — `new URL()` rewrites `::ffff:127.0.0.1` as
  `::ffff:7f00:1`, and a check that pattern-matches the dotted form silently
  never fires.
- **Redirects are followed manually**, revalidating every hop, because a public
  URL redirecting to a private address is the whole attack.
- Hard caps on time (10s), size (2MB) and hops (3); HTML only.

Extraction is deliberately simple: drop the furniture (`script`, `style`,
`nav`, `header`, `footer`, `aside`), keep block structure, decode entities,
prefer `<article>`/`<main>`. A page it can't read **fails honestly** so the
learner pastes instead — which always works and needs no network at all.

## Guarantees

- **Nothing completes the learner's turn.** No summary, no suggested angle, no
  insertable text. The outline on the draft screen is `select-none` reference.
- **Fail-soft everywhere.** No AI key → the generic ladder, the local sharpen,
  the deterministic borrowing verdict, and a warm local polish. The only thing
  that genuinely needs the network is link-fetching, and pasting replaces it.
- **Untrusted text is data.** The source is third-party content and the drafts
  are the learner's; both are passed as clearly-delimited content, never as
  instructions.
- **Attribution is kept.** The source's title, site and URL travel with the
  session and are shown on the finished piece.

## API

| Route | In → out |
| --- | --- |
| `POST /api/respond/source` | `{ text }` or `{ url }` → `{ source: SourceRef, text }`. No AI. |
| `POST /api/respond/questions` | `{ level, source, text }` → `{ questions[{rung,question}] }` (4, in ladder order) |
| `POST /api/respond/sharpen` | `{ level, question, answer }` → `{ question }` |
| `POST /api/respond/ideas` | `{ level, source, text, ideas[] }` → `{ verdicts[{id,own,note,borrowed?}] }`. No AI gate. |
| `POST /api/respond/polish` | `{ level, source, hook, draft }` → `Polish` |

## Data

- **Live**: `Store.respondSessions` — the source (with a bounded
  copy of its text so a session reopens), the turns, the ideas, the draft and
  the polish. Bounded to 20, because each carries its source text. The **idea
  bank** is derived: every idea across every session with `drafted !== true`.
- Phrases captured while reading, and phrases kept from the finished draft,
  join `Store.minedPhrases` like any other capture — same pool, same Leitner
  schedule as Daily Words and the Phrasebook.
- **DB**: not yet mapped. `respondSessions` would follow `news_sessions`'
  shape (scalars for the list, JSONB for exact resume) when Auth lands.

## Code

| Piece | File |
| --- | --- |
| Ladder, borrowing check, draft targets | `src/lib/shared/respond.ts` |
| URL fetch + SSRF guards + HTML extraction | `src/lib/server/extract.ts` |
| The four AI jobs | `src/lib/server/respond.ts` |
| Routes | `src/app/api/respond/{source,questions,sharpen,ideas,polish}/route.ts` |
| UI (home · think · angles · draft · done) | `src/components/Respond.tsx`, `/respond` |
| Store | `saveRespondSession` / `removeRespondSession` in `src/store/StoreContext.tsx` |
