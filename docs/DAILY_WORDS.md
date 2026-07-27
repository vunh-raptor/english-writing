# Daily words — meet it, write it from memory, use it for real

The mode that **hands you language** instead of waiting for you to meet it. A
small set of high-frequency words every day, each walked from first encounter
to a sentence you wrote yourself, then handed to the same spaced schedule the
Phrasebook runs on.

Route `/words` (and `/`, because the day starts here).

---

## The research, and what we concluded from it

The question was: *what is actually the best way to learn new words every day?*
Five findings decided the design, and each one shows up as a mechanic you can
point at.

| Finding | What it settles | Where it lives here |
| --- | --- | --- |
| **Frequency coverage.** ~2,800 high-frequency words give **>92% coverage** of general English text (the New General Service List; Browne, Culligan & Phillips 2013, in the General Service List tradition). | *Which* words. Rare words are a bad trade for a learner with 10 minutes a day. | A curated, **frequency-first curriculum** banded A2 → C1 (`lib/shared/words.ts`), drawn at the learner's level |
| **Deliberate beats incidental.** Incidental pickup from reading nets only ~9–18% of target words per encounter set; intentional vocabulary activities are reliably effective. | Waiting to meet words in the wild is too slow to be the main engine. A daily deliberate set is right. | The daily set itself: chosen for you, not stumbled on |
| **Retrieval practice.** Recalling beats re-studying for L2 vocabulary, and **recall formats beat recognition** for productive knowledge. | Flashcard *flips* and multiple choice test the wrong thing. | The **retrieve** beat: the word disappears and you type it back from its meaning |
| **Involvement Load Hypothesis** (Laufer & Hulstijn) — retention rises with need + search + evaluation. In direct comparisons (e.g. Keating 2008), **writing your own sentence beats fill-in-the-gap, which beats reading**. Generative use in a *new* context beats repetition in a familiar one. | The round that decides whether a word survives is the one where you compose with it. | The **use** beat: a real-life moment, answered in your own sentence — the only beat that earns an interval |
| **Semantic interference.** Words taught in a semantic set (synonyms, opposites, "five kinds of weather") are learned *more slowly* — cross-association (Tinkham 1993; Finkbeiner & Nicol 2003; Erten & Tekin 2008; the evidence is mixed but the downside is asymmetric). | Grouping a day's words by topic — what most apps do — actively hurts. | Every curriculum entry carries a **`field`**, and a day's set never repeats one |
| **Spacing.** Spaced practice beats massed on delayed tests; equally-spaced retrieval is strong for long-term retention. | A word met once is a word lost. | Met words join the shared **Leitner** schedule; a day is *reviews + new*, never new alone |

**The synthesis — the method this mode implements:**

> A small daily set of frequency-first, *semantically unrelated* words. Each
> one: one good encounter → retrieval from memory → your own sentence in a new
> situation. Then spaced review, forever, in the same pool as everything else
> you're learning.

One honest caveat, stated the way the rest of the project states them: the
semantic-clustering literature is genuinely mixed, and the involvement-load
predictions hold better for *retention* than for depth of knowledge. We took
the low-risk side of both — unrelated sets cost nothing if the effect is
small, and a written sentence is worth having regardless.

## What a day looks like

```
/words
  Today's set = REVIEWS first (curriculum words the schedule says are ripe)
                then NEW words (wordsPerDay, default 5; 3 / 5 / 8 in Settings)
                capped at 10 items total, so a day is always finishable
  New words are masked on the home screen — the first look belongs to the
  session, not to a list you scrolled past

Start  → POST /api/words/daily — ONE call: a real-life moment per word
         (fails → local moments, session runs anyway)

per word:
  1. MEET      (new words only) the card: word · part of speech · plain meaning
               · a natural example · the partners it travels with.
               "Got it" is held for a few seconds — nobody skips the encounter.
  2. RETRIEVE  the card is replaced by its meaning + a masked partner cue
               ("it goes in ‘can't ___ to’"). You type the word.
               Any normal inflection counts — this tests the form-meaning
               link, not spelling. "Show me" is always there and always honest.
  3. USE       the moment + the card (visible now) → you write your own
               sentence → POST /api/phrasebook/judge
               model judgment ∪ our inflection-tolerant matcher, so a lazy
               model can never erase a real production

debrief:  "N of M went from memory into your own sentence" — every word, the
          sentence you wrote, and when each one comes back
```

### Honest scheduling

| How it went | Schedule | Why |
| --- | --- | --- |
| Retrieved clean **and** used it | `reviewCard(true)` — box up, longer rest | The whole arc, unaided |
| Used it after a peek or a wrong recall | no change — stays due | Help is free; the interval isn't |
| Didn't use it, **new word** | no change — stays due | A first meeting is never punished |
| Didn't use it, **review word** | `reviewCard(false)` — lapse, due now | It was supposed to be there |

A word joins the learner's library the moment it survives its "use" beat —
that's when it stops being the app's word and starts being theirs. Finishing
the set commits the day: streak, totals, and every sentence tokenized into the
vocabulary count (so "your vocabulary" only ever counts words they **wrote**).

## Guarantees (same stance as News Chat and the Phrasebook)

- **Nothing completes your turn.** The moment never contains the word (checked
  in code, server-side); worked examples are inert; the only way through is
  typing a sentence.
- **Fail-soft everywhere.** No AI key or no network → local moments, local
  judging, the full arc still runs. The curriculum, the cards, the recall check
  and the schedule are all offline by construction.
- **The day is fixed once drawn.** `Store.wordDays[today]` freezes the set, so
  reloading never reshuffles it and you can't farm tomorrow's words today.
  Leaving halfway and coming back resumes exactly where you were.
- **Untrusted text is data.** The learner's sentences are content in the
  prompts, never instructions.

## API

| Route | In → out |
| --- | --- |
| `POST /api/words/daily` | `{ level, words[{id,word,pos,meaning,collocations}] }` → `{ rounds[{id,setup,task,examples[]}] }` |
| `POST /api/phrasebook/judge` | reused as-is — a word is a lexical item like any other |

Server module `src/lib/server/words.ts` (mission.ts robustness pattern:
first-`{…}` extraction, per-field coercion, hard code guards — a setup that
leaks its word is dropped, an example that doesn't contain it is dropped).

## Data

- **Live (guest-first)**: met words join `Store.minedPhrases` as `Phrase`
  entries with `kind: "word"`, `captured: { module: "Daily words", … }`, and
  their schedule in `Store.phraseSrs` — the same pool and scheduler the
  Phrasebook and News Chat share. `Store.wordDays` records each day's issued
  set. Clean uses tally into `Store.phraseApplied`; the streak and vocabulary
  land on `Store.profile` / `Store.vocab` via `finishWordSession`.
- **DB (ready-to-wire)**: migration `0005_daily_words.sql` adds the `daily`
  value to `phrase_source`; `saveDailyWord()` in `src/lib/server/db/phrases.ts`
  mirrors the client enrollment. The curriculum id (`w-<word>`) is the row
  slug, so a word dedupes across surfaces. Everything else it needs already
  exists on the `phrases` table.

## Code

| Piece | File |
| --- | --- |
| Curriculum, day-set rules, matchers | `src/lib/shared/words.ts` |
| Round builder (the one AI job) | `src/lib/server/words.ts` |
| Route | `src/app/api/words/daily/route.ts` |
| UI (home · session · debrief) | `src/components/DailyWords.tsx`, `/words` |
| Store commits | `issueWordDay`, `finishWordSession` in `src/store/StoreContext.tsx` |

### Growing the curriculum

`WORD_SEEDS` is the spine, ordered roughly by usefulness within each band. To
extend it, add entries with a plain-words `meaning`, one natural `example`, 2–4
`collocations`, and — the part that's easy to get wrong — a `field` that
honestly names the semantic area, so the day-set rule can keep related words
apart. Order within a band is the order they're met.
