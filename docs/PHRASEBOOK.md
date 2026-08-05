# Phrasebook — highlight it, then learn it by using it

The capture-to-application loop. The learner highlights any lexical unit while
reading — a **word, collocation, idiom, pattern, phrase, or whole sentence** —
in the News Chat manuscript (briefing, partner turns, debrief) or the Ask
margin, saves it in one tap, and practices it in a dedicated module
(`/phrasebook`). Whatever the practice mode, every round ends the same way:
**the learner writes their own sentence**. There is no flashcard flip anywhere.

## The research this is built on

The module is organized around **Nation's four strands** — a balanced language
course gives roughly equal time to meaning-focused input, meaning-focused
output, language-focused learning, and fluency development — plus four
findings that shape the mechanics:

| Finding | Where it lives here |
| --- | --- |
| **Four strands** (Nation 2007): output, deliberate study, and fluency work are *separate strands*, each needed | The four practice **modes** (below) — one per strand; capture + News Chat supply the input strand |
| **Involvement Load Hypothesis** (Laufer & Hulstijn; systematic review 2022): tasks requiring evaluation + writing yield the deepest retention | Every mode ends in writing your own sentence; judging evaluates *application*, not recognition |
| **Retrieval practice / testing effect** (incl. within-session repeated retrieval, SSLA): recalling beats re-study | Recall mode; hidden-first items in Mixed from Leitner box 2; peeks honestly recorded |
| **Collocation research / the lexical approach** (Lewis; input-frequency studies): words are learned in company | `kind`-aware practice — a single word drills with its **collocations** ("word partners" method); partners stored on the item |
| **Generation effect + desirable difficulties** (Bjork) | Nothing insertable, examples inert, delayed-copy flash for new items |

- **Capture at the moment of meeting.** A unit highlighted in a real article
  or conversation arrives with its passage — the strongest encoding moment.
  Enrichment classifies its **kind** (word / phrase / idiom / pattern /
  collocation / sentence) so practice can adapt.
- **Honest scheduling, one pool.** Clean application → `reviewCard(true)`
  (interval earned). Applied after a peek/flash → no change (stays due).
  Missed → lapse (due now). Study never touches the schedule; Sprint never
  punishes. Captures share the pool and SRS with News Chat's mission targets
  **and the words met in [Daily words](DAILY_WORDS.md)** — one pool, one
  scheduler, three surfaces.

## The four modes — the learner chooses

| Mode | Strand | What a round is | Items | Schedule effect |
| --- | --- | --- | --- | --- |
| **Mixed** | meaning-focused output | AI scenario rounds, methods interleaved (moment / reply / upgrade-it / make-it-yours / word-partners) | due (≤6) | clean ↑ · peek = stays due · miss ↓ |
| **Recall** | retrieval practice | item hidden — retrieve from meaning, then apply; brand-new items get a 7s study-flash, then are written **from memory** (delayed copy) | due (≤6) | flash/peek = stays due; clean recall ↑ |
| **Sprint** | fluency development | 45s per round, local prompts, item visible | familiar only (box ≥ 1) | clean ↑ · misses cost **nothing** |
| **Study** | language-focused learning | the full card (meaning, example, origin, similar ways, partners, where you met it) → write your own example | newest (≤6) | **none** — study isn't testing |

Only Mixed calls the AI round-builder; Recall, Sprint, and Study run on the
item's own stored material — instant, and needing no AI (judging still
uses the API when available, with the deterministic matcher as fallback).

## The flow

```
READ (News Chat, Ask margin)
  └─ highlight → [Save] chip → POST /api/phrasebook/enrich
        → { text (reusable unit), meaning, example (different situation),
            register, alternatives }
        → store.collectPhrase (dedupe by content slug; unscheduled = due today)
        (enrich fails → the raw highlight is saved as-is — capture never fails)

/phrasebook (library — "your commonplace book")
  main column: search + state filters (all/due/learning/mastered) over rows
    grouped Due today / Learning / Mastered; each row = phrase · meaning ·
    five Leitner-box ticks · state label, expanding to the example ("in
    another situation"), the "similar ways" cluster + register, provenance
    ("saved from News Chat — “…passage…”") and Remove
  sticky rail: Today's session — the practice launcher: a four-MODE chooser
    (Mixed / Recall / Sprint / Study, each showing how many items are ready) +
    the selected mode's blurb + a due preview + Practice now ·
    This week (day-by-day applications, Store.phraseApplied) ·
    The journey (new → learning → mastered, srsSummary)

Practice now (≤6 items, the chosen mode)
  └─ mixed only: POST /api/phrasebook/drill  — ONE call: a full round pack per
       phrase; the other modes run on the item's own stored material (instant,
       offline-safe). Method rotates through a fixed arc (code-assigned, not
       model-chosen):
         situation  an everyday moment to respond to
         reply      a 2-3 line mini-chat ending on a line spoken TO you
         rephrase   a flat "Plain version: …" sentence to say better
         personal   a pointer at YOUR life where the phrase fits
       each round = { setup, task, 2 worked examples }
       setups never contain the phrase; examples MUST (both code-checked
       via phraseMatcher)
  └─ per round: setup + task → (phrase shown | hidden-for-recall + Peek)
       "See it used" panel: generated examples + the stored enrichment
       example + "similar ways" — inert (select-none); in a recall round
       opening it counts as the peek (examples show the phrase)
       → learner writes their own sentence
       → POST /api/phrasebook/judge → { used, note, ≤1 upgrade }
         model judgment ∪ deterministic phraseMatcher (a lazy model can
         never erase a real production)
       → SRS applied by the clean/peeked/missed rules above
       (a round rail across the top tracks ✓ clean / ✓ peeked / — missed)
  └─ debrief: "N of M said in your own words" — every round's outcome, the
       learner's own sentence, and when each phrase returns
```

Method variety is planned, not random: sessions walk
`situation → reply → rephrase → personal → …` (easiest ask first), the same
arc offline — where `rephrase` is skipped, since its plain sentence needs the
AI, and local packs cover the other three generically.

## Guarantees (same stance as News Chat)

- **Nothing completes the learner's turn.** Situations contain no ready-made
  answer; the phrase card is reference, not insertable text; the only way
  through a round is typing a sentence.
- **Fail-soft everywhere.** Enrich fails → save raw. Drill fails → local
  generic situations (marked "offline"). Judge fails → deterministic matcher +
  self-evident notes. Practice never blocks on the network.
- **Untrusted text is data.** Highlights, passages, and the learner's sentences
  are content in the prompts, never instructions.

## API

| Route | In → out |
| --- | --- |
| `POST /api/phrasebook/enrich` | `{ level, text, context }` → `CaptureEnrichment` |
| `POST /api/phrasebook/drill` | `{ level, items[{id,text,meaning,example?}] }` → `{ rounds[{id,method,setup,task,examples[]}] }` |
| `POST /api/phrasebook/judge` | `{ level, phrase{text,meaning}, situation, sentence }` → `DrillJudgment { used, note, upgrade? }` |

All on the fast model tier; server module `src/lib/server/phrasebook.ts`
(mission.ts robustness pattern: first-`{…}` extraction, per-field coercion,
hard code guards).

## Data

- **Live**: captures join `Store.minedPhrases` (bounded, deduped
  by the content slug `phraseId(text)`) with `Phrase.captured =
  { module, context, day }` provenance; scheduling stays in `Store.phraseSrs`.
  `collectPhrase` / `removePhrase` in `StoreContext`. Clean applications are
  also tallied per local day in `Store.phraseApplied` (drill cleans, Coach
  productions, mission `produced` targets — pruned to recent weeks), which
  powers the library's "This week" card.
- **DB (ready-to-wire)**: migration `0003_phrasebook.sql` adds source value
  `'captured'` + `captured_context`; migration `0004_lexical_kinds.sql`
  extends `phrase_kind` to the full `LexKind` set and adds `collocations`;
  `src/lib/server/db/phrases.ts` mirrors `collectPhrase` for when Supabase
  Auth lands. See [`../supabase/README.md`](../supabase/README.md).

## UI pieces

- `src/components/SelectionCapture.tsx` — generic highlight-to-save wrapper
  (floating chip over the selection; context from the nearest
  `data-capture-context` ancestor; input/textarea selections ignored).
- `src/components/NewsChat.tsx` — wrapped in it; briefing, chat turns, Ask
  answers, and the debrief are marked as context blocks.
- `src/components/Phrasebook.tsx` + `/phrasebook` — library, drill, done
  screens; nav entry under **Practice**.
