# Phrasebook — highlight it, then learn it by using it

The capture-to-application loop. The learner highlights any word, phrase, or
sentence while reading — the News Chat manuscript (briefing, partner turns,
debrief) or the Ask margin — saves it in one tap, and later practices it in a
dedicated module (`/phrasebook`). The practice is **production-first by
design**: every round is a real-life situation answered in the learner's own
sentence. There is no flashcard flip anywhere in the mode.

## Why this shape

Memorization-first tools (flashcards) train *recognition*; what learners want
is to *use* the language in life. So the Phrasebook applies the same principles
News Chat v2 established (generation effect, desirable difficulties,
scaffold-then-fade, honest SRS):

- **Capture at the moment of meeting.** A phrase highlighted in a real article
  or conversation arrives with context — the strongest encoding moment.
- **Practice = apply, never recall-only.** A drill round shows a tiny everyday
  situation that *calls for* the phrase; the learner answers it in their own
  words. Knowing the meaning is never the finish line — using it is.
- **Recall fades in with the schedule.** New/young phrases (Leitner box < 2)
  are shown during the round (scaffold). From box 2 the phrase starts hidden —
  meaning only — so the learner must *retrieve, then apply*. Peeking is always
  allowed, and honestly recorded.
- **Honest scheduling, one pool.** Clean application → `reviewCard(true)`
  (interval earned). Applied after a peek → no change (stays due). Missed →
  lapse (due now). Captures join the same pool and SRS as News Chat's mission
  targets, so the **Phrase Coach** recycles everything too — one curriculum,
  two practice surfaces.

## The flow

```
READ (News Chat, Ask margin)
  └─ highlight → [Save] chip → POST /api/phrasebook/enrich
        → { text (reusable unit), meaning, example (different situation),
            register, alternatives }
        → store.collectPhrase (dedupe by content slug; unscheduled = due today)
        (enrich fails → the raw highlight is saved as-is — capture never fails)

/phrasebook (library)
  stats: due today · new · learning · mastered   (srsSummary)
  rows:  phrase · state chip · meaning · "saved from News Chat — “…passage…”"

Practice now (≤6 due)
  └─ POST /api/phrasebook/drill  — ONE call: a situation per phrase
       situations never contain the phrase (code-checked via phraseMatcher)
  └─ per round: situation → (phrase shown | hidden-for-recall + Peek)
       → learner writes their own sentence
       → POST /api/phrasebook/judge → { used, note, ≤1 upgrade }
         model judgment ∪ deterministic phraseMatcher (a lazy model can
         never erase a real production)
       → SRS applied by the clean/peeked/missed rules above
  └─ done: "N of M applied in real situations"
```

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
| `POST /api/phrasebook/drill` | `{ level, items[{id,text,meaning}] }` → `{ situations[{id,situation}] }` |
| `POST /api/phrasebook/judge` | `{ level, phrase{text,meaning}, situation, sentence }` → `DrillJudgment { used, note, upgrade? }` |

All on the fast model tier; server module `src/lib/server/phrasebook.ts`
(mission.ts robustness pattern: first-`{…}` extraction, per-field coercion,
hard code guards).

## Data

- **Live (guest-first)**: captures join `Store.minedPhrases` (bounded, deduped
  by the content slug `phraseId(text)`) with `Phrase.captured =
  { module, context, day }` provenance; scheduling stays in `Store.phraseSrs`.
  `collectPhrase` / `removePhrase` in `StoreContext`.
- **DB (ready-to-wire)**: migration `0003_phrasebook.sql` adds source value
  `'captured'` + `captured_context` to the `phrases` table;
  `src/lib/server/db/phrases.ts` mirrors `collectPhrase` for when Supabase
  Auth lands. See [`DATA_MODEL.md`](DATA_MODEL.md).

## UI pieces

- `src/components/SelectionCapture.tsx` — generic highlight-to-save wrapper
  (floating chip over the selection; context from the nearest
  `data-capture-context` ancestor; input/textarea selections ignored).
- `src/components/NewsChat.tsx` — wrapped in it; briefing, chat turns, Ask
  answers, and the debrief are marked as context blocks.
- `src/components/Phrasebook.tsx` + `/phrasebook` — library, drill, done
  screens; nav entry under **Practice**.
