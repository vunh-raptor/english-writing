# Phrasebook — highlight it, then fight it into fluency

The capture-to-fluency loop. The learner highlights any lexical unit while
reading — a **word, collocation, idiom, pattern, phrase, or whole sentence** —
in the News Chat manuscript (briefing, partner turns, debrief) or the Ask
margin, saves it in one tap, and practises it in the **arena** (`/phrasebook`).
Words met in [Daily words](DAILY_WORDS.md) land in the same book.

## Why an arena

Remembering an item and *using it like a native* are different skills. The
old Phrasebook (four modes: Mixed · Recall · Sprint · Study) asked for one
sentence per item and accepted it whether or not the English was right, so it
mostly proved the first. A learner asked for the opposite: a try-hard space
that does whatever it takes to make their words usable, fluently. That was a
deliberate product decision, and it **replaced the four modes** — the calm,
unjudged Study path is gone with them, which is a real cost on a heavy day.

What changed, in one line each:

- **Every sentence is held until it is right** — the Daily Words fences, by
  sharing their code (`judgeHeld`), not copying it. See "The fences" below.
- **One item, many kinds of use.** An item works at several *stations*, each
  testing something the others structurally can't.
- **Native is earned, not declared.** An item is Native only once it has landed
  clean at every station on its ladder — read from the ledger, never stored.

## The research it rests on

| Finding | Where it lives here |
| --- | --- |
| **Involvement Load** (Laufer & Hulstijn): writing your own sentence beats gap-fill beats reading | Every station ends in the learner's own sentence |
| **Retrieval practice**, incl. within-session repeated retrieval | `recall` and `clock` hide the item; a slipped item comes back once, two stations later, from memory |
| **Collocation research / the lexical approach** (Lewis) | `partner` gaps the word the item travels with — the chunk a free-writing round lets learners avoid |
| **Transfer-appropriate processing / varied practice** | `shift` (past, negative, question, someone else, future) and `register` (formal ↔ casual) make it work in shapes and settings it wasn't met in |
| **Fluency development** (Nation's fourth strand) | `clock` — the same item, from memory, inside 45s; only ever after it has been said untimed |
| **Interleaving / desirable difficulties** (Bjork) | Stations interleave items, so no item is worked twice in a row |

## The stations

The ladder, easiest ask first (`NATIVE_LADDER` in `lib/shared/arena.ts`):

| Station | What they see | What it proves |
| --- | --- | --- |
| **recall** | the meaning only; the item hidden | the form-meaning link exists |
| **partner** | the item, and its partner chunk with the partner gapped (`___ a complaint`) | it travels with the right company |
| **shift** | the item, and a shape the scene pulls for | it bends without breaking |
| **register** | the item, and a listener the setting changes | it fits the room |
| **native** | the item, and a flat clumsy line to say better | it is the natural choice, not just a correct one |
| **clock** | the meaning only, 45s, scene covered until they start | it comes out fluently |

`partner` is skipped for an item with no partner chunk to gap. A **combo**
closes each bout: the two items furthest from Native, one sentence. It earns
no mark — it is the stretch, not a station.

**What a bout asks** (`planStations`, `planBout`): up to 4 items, 3 stations
each — the next unearned ones in ladder order, the clock always last and never
alone. Once everything untimed is earned, the hardest earned stations return as
maintenance. The shape and the listener are code-assigned and rotate.

**What is judged.** Only the language. The shape or listener a station asks
for is the pull of the scene, never a pass mark: a sentence held for not being
in the past tense would be a sentence held for its idea, which the fences
forbid. What the partner station *does* hold is a wrong partner (`do a
complaint`) — that is language.

## The fences (shared with Daily Words)

Required correction is the thing most likely to make a learner quit, so the
arena takes every Daily Words fence, through the same code:

| Fence | Where |
| --- | --- |
| Nothing checks you while you type; `spellCheck={false}` | `ArenaSession.tsx` composer |
| The corrected sentence is never shown — not as a restatement, and not as the off fragment with one word swapped (`make a complaint`) | `hintLeaks`, `suggestsFix` in `lib/shared/words.ts` |
| Help grows one notch per miss and stops at a frame with a gap | `hintLevel` |
| A sentence is held only when two judges agree | `judgeHeld` / `isFaulty` in `lib/server/words.ts` |
| A model can't erase an item that is visibly there; an outage falls back to detection | `settleVerdict`, `itemMatcher` |
| A hidden item is never named by a "missing" hint | `judgeHeld` (`hidden`) |
| After three misses, "Leave it for later" | `talkCanLeave` |

…and adds two of its own:

- **A bout can end at any point.** Every sentence is already in the ledger;
  only items whose stations all finished move on the schedule.
- **One second try, never a loop.** A station that ends not-clean brings its
  item back once, two stations later, as `recall` on a spare scene written up
  front (`withRematch`).

## Honest scheduling

| How the bout went for an item | Schedule |
| --- | --- |
| Clean at every station | `reviewCard(true)` — earned interval |
| Slipped at more stations than it landed (scheduled item) | `reviewCard(false)` — lapse |
| Anything else, or a first meeting, or unfinished | no change — stays due |

A clock station landed right but late is *help*, not a mark (`stationOutcome`).

## Native marks live in the ledger

Every arena sentence goes to `productions` with `surface: "phrasebook"` and
`mode: "arena-<station>"`. An item's marks are the stations with a `clean` row
(`marksFromLedger`). Nothing else stores them, so a mark can't drift from the
sentence that earned it. The old modes' rows (`mode: "recall"` etc.) never held
a sentence and deliberately don't count.

## Capture

```
READ (News Chat, Ask margin)
  └─ highlight → [Save] chip → POST /api/phrasebook/enrich
        → { text (reusable unit), kind, meaning, example (different situation),
            register, alternatives, collocations }
        → collectPhrase (dedupe by content slug; unscheduled = due today)
        (enrich fails → the raw highlight is saved as-is — capture never fails)
```

## The bout, end to end

```
/phrasebook  library + the arena card (lineup with Native bars, or "Back into the bout")
  └─ Enter → POST /api/phrasebook/arena {move:"open", ids}
       server: pick (learner's pick | due → furthest from Native), plan stations,
       ONE scene per station + a spare per item, 2 items per generation call in
       parallel, each checked in code (no item, no blank, someone speaking,
       told to "you"; a hidden station's task that names the item is swapped
       for a neutral instruction). A station that loses its scene isn't played.
  └─ per station: say → judgeHeld → landed | almost (ochre note) | missing
       peek (free; not clean) · clock (server time) · leave (after 3 misses)
       each sentence → productions at once
  └─ finish (or "End here") → schedules move → debrief: what landed first,
       each item's Native bar with today's marks ringed
```

## Guarantees

- **Nothing completes your turn.** No scene contains its item (code-checked);
  examples are inert; a correction never contains the corrected sentence.
- **Nothing is pre-written.** Every scene is generated for its item and
  station. The six offline packs the old Mixed mode fell back to are deleted;
  a bout that can't be built says so and offers a retry.
- **The bout is the server's.** One `ArenaBout` per learner in `ai_content`
  (`arena_bout`, key `current`); moves name their station, so a stale tab or
  double tap gets a 409 and the real state, never a sentence on the wrong
  station.
- **Untrusted text is data.** Highlights, passages and sentences are delimited
  content in every prompt.

## API

| Route | In → out |
| --- | --- |
| `POST /api/phrasebook/enrich` | `{ text, context }` → `CaptureEnrichment` |
| `GET /api/phrasebook/arena` | → `{ bout: ArenaBout \| null, marks: ArenaMarks }` — never generates |
| `POST /api/phrasebook/arena` | `{ move: "open", ids? }` · `{ move: "say", index, sentence }` · `{ move: "peek"\|"clock"\|"leave", index }` · `{ move: "finish" }` → `{ bout }`; 409 when the learner's state rules the move out |

Server modules: `lib/server/phrasebook.ts` (enrich, `arenaScenes`,
`arenaTurn`), `lib/server/arena.ts` (the bout), prompts in
`lib/server/prompts/phrasebook.ts`. Pure rules: `lib/shared/arena.ts`.

## Data

- **Live**: captures join `Store.minedPhrases` (bounded, deduped
  by the content slug `phraseId(text)`) with `Phrase.captured =
  { module, context, day }` provenance; scheduling stays in `Store.phraseSrs`.
  `collectPhrase` / `removePhrase` in `StoreContext`. Clean applications are
  also tallied per local day in `Store.phraseApplied` (arena items clean at every station, Coach
  productions, mission `produced` targets — pruned to recent weeks), which
  powers the library's "This week" card. The arena adds no table and no
  migration: the bout is one `ai_content` row, and Native marks are read from
  `productions`.
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
- `src/components/Phrasebook.tsx` + `/phrasebook` — the library and the arena
  card (lineup, pick, resume).
- `src/components/arena/` — `ArenaSession` (rail, station card, thread, clock,
  composer), `ArenaDebrief`, `NativeMeter`, `meta.ts` (station copy).
