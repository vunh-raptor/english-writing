# Daily words — meet it, write it from memory, use it for real

The mode that **hands you language** instead of waiting for you to meet it. A
small set of high-frequency words every day, each walked from first encounter
to a sentence you wrote yourself, then handed to the same spaced schedule the
Phrasebook runs on.

Route `/words` (and `/`, because the day starts here).

---

## The research, and what we concluded from it

The question was: *what is actually the best way to learn new words every day?*
Six findings decided the design, and each one shows up as a mechanic you can
point at.

| Finding | What it settles | Where it lives here |
| --- | --- | --- |
| **Frequency coverage.** ~2,800 high-frequency words give **>92% coverage** of general English text (the New General Service List; Browne, Culligan & Phillips 2013, in the General Service List tradition). | *Which* words. Rare words are a bad trade for a learner with 10 minutes a day. | A **frequency-first curriculum** banded A2 → C1, generated for the learner (`lib/server/prompts/curriculum.ts`) and drawn at their level |
| **Deliberate beats incidental.** Incidental pickup from reading nets only ~9–18% of target words per encounter set; intentional vocabulary activities are reliably effective. | Waiting to meet words in the wild is too slow to be the main engine. A daily deliberate set is right. | The daily set itself: chosen for you, not stumbled on |
| **Retrieval practice.** Recalling beats re-studying for L2 vocabulary, and **recall formats beat recognition** for productive knowledge. | Flashcard *flips* and multiple choice test the wrong thing. Everything is typed. | The whole **drill** ladder — every rung ends with the learner typing, never picking |
| **Involvement Load Hypothesis** (Laufer & Hulstijn) — retention rises with need + search + evaluation. In direct comparisons (e.g. Keating 2008), **writing your own sentence beats fill-in-the-gap, which beats reading**. Generative use in a *new* context beats repetition in a familiar one. | The round that decides whether a word survives is the one where you compose with it. | The **use** beat: a real-life moment, answered in your own sentence — the only beat that earns an interval |
| **Semantic interference.** Words taught in a semantic set (synonyms, opposites, "five kinds of weather") are learned *more slowly* — cross-association (Tinkham 1993; Finkbeiner & Nicol 2003; Erten & Tekin 2008; the evidence is mixed but the downside is asymmetric). | Grouping a day's words by topic — what most apps do — actively hurts. | Every entry carries a **`field`**; the generator is told to spread a batch across unrelated ones (and rejected in code if it doesn't), and a day's set never repeats one |
| **Spacing.** Spaced practice beats massed on delayed tests; equally-spaced retrieval is strong for long-term retention. | A word met once is a word lost. | Met words join the shared **Leitner** schedule; a day is *reviews + new*, never new alone |
| **Desirable difficulties** (Bjork). A task that stays easy stops teaching; difficulty should track how strong the memory already is. | One fixed exercise is wrong for a word's whole life. | The **drill ladder** below: the ask hardens as the Leitner box rises, so difficulty expands alongside the interval |

**The synthesis — the method this mode implements:**

> A small daily set of frequency-first, *semantically unrelated* words. Each
> one: one good encounter → a retrieval drill pitched at how well you already
> know it → your own sentence in a new situation. Then spaced review, forever,
> in the same pool as everything else you're learning.

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
  1. MEET   (new words only) the card: word · part of speech · plain meaning
            · a natural example · the partners it travels with.
            "Got it" is held for a few seconds — nobody skips the encounter.
  2. DRILL  one rung of the ladder below, chosen by the word's Leitner box.
            "Show me" is always there and always honest.
  3. USE    the moment + the card (visible now) → you write your own
            sentence → POST /api/phrasebook/judge
            model judgment ∪ our inflection-tolerant matcher, so a lazy
            model can never erase a real production

bridge:   the day's bonus — ONE sentence using two of today's words. Because a
          set is drawn from different semantic fields, joining them is a real
          stretch, and elaborating a link between unrelated things is exactly
          the processing that makes memories durable. Skippable, and it never
          touches the schedule: a bonus that could lapse a word would make the
          honest scheduling everywhere else a lie.

debrief:  "N of M went from memory into your own sentence" — every word, the
          sentence you wrote, and when each one comes back
```

### The drill ladder

The middle beat is not one exercise, it's five — and which one a word gets is
decided by its Leitner box, so **the ask hardens as the memory does**. That's
"desirable difficulties" applied to the task rather than only to the schedule.
Each rung tests something the others structurally can't:

| Box | Rung | What you see | What it tests that the others don't |
| --- | --- | --- | --- |
| new · 0 | **recall** | the meaning, the part of speech, a masked partner cue (`can't ___ to`) | the form-meaning link itself — the thing that has to exist before anything else can be asked |
| 1 | **fit** | a natural sentence with the word cut out — the classic gap-fill | the **form**. `worry` where the sentence wants `worried` is its own verdict ("right word, wrong ending"), not a flat miss |
| 2 | **partner** | the *collocate* gapped, not the word: `___ a decision`, first letter shown | which words travel together — the last thing to arrive in a second language, and the thing a free-writing round can't force, because a learner just avoids the chunk they're unsure of |
| 3 | **repair** | a sentence using the word almost right (`I did a decision`) | noticing the gap between *almost* and *natural*. It's someone else's sentence being marked, never the learner's, and it's rendered in **ochre** — the tutor's pencil, per the design system's "never red" |
| 4+ | **echo** | **a sentence you wrote yourself**, weeks ago, with the word gapped | nothing generic can match it: the retrieval cue is your own life. From box 2 up this outranks every other rung whenever a stored line exists |

`echo` is the one rung no flashcard app can offer, because none of them ever had
you compose the sentence in the first place. It costs one field on the store
(`Store.myLines`) and no AI at all.

**The ladder degrades, it doesn't break.** `pickDrill` walks *down* the ladder
until it finds a rung whose material actually exists — checked by running the
real gap functions, not by proxies. A round that came back without a `repair`
pair drops a box-3 word to `partner`, and a word whose every partner chunk
starts with the word itself (`borrow money`, `borrow it from someone`) drops
again to `fit` on its own stored example. `recall` always works, so the ladder
can't fail once a session has started.

### Honest scheduling

| How it went | Schedule | Why |
| --- | --- | --- |
| Drilled clean **and** used it | `reviewCard(true)` — box up, longer rest | The whole arc, unaided |
| Used it after a peek, a wrong answer, or the wrong form | no change — stays due | Help is free; the interval isn't |
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
- **Nothing is pre-written.** The words are generated for this learner, and so
  is every moment they answer. There are no generic setups left: the ten open
  moments that used to stand in for a failed round ("a friend asks how your week
  is going") fitted any word and elicited none, so a session that cannot get
  real material says so and offers a retry.
- **The material is fixed once generated.** A day's rounds are stored in
  `ai_content` keyed by the day and the word set, so reloading mid-session
  returns the same moments rather than a fresh set nobody has read.
- **Every sentence is kept.** The "use" beat writes to `productions` the moment
  it is judged — with the moment that drew it out and the verdict — so
  abandoning the day halfway still keeps what was produced.
- **The day is fixed once drawn.** `Store.wordDays[today]` freezes the set, so
  reloading never reshuffles it and you can't farm tomorrow's words today.
  Leaving halfway and coming back resumes exactly where you were.
- **Untrusted text is data.** The learner's sentences are content in the
  prompts, never instructions.

## API

| Route | In → out |
| --- | --- |
| `POST /api/words/daily` | `{ level, words[{id,word,pos,meaning,collocations}] }` → `{ rounds[{id,setup,task,examples[],cloze?,repair?{wrong,right}}] }` |
| `POST /api/phrasebook/judge` | reused as-is — a word is a lexical item like any other |

Server module `src/lib/server/words.ts` (mission.ts robustness pattern:
first-`{…}` extraction, per-field coercion, hard code guards — a setup that
leaks its word is dropped, an example or cloze that doesn't contain it is
dropped, and a repair pair whose halves differ by more than a word-level fix is
dropped).

One deliberate choice worth calling out: the model is asked for a **complete
sentence**, never one with a blank in it. The gap is cut in code
(`gapSentence`), so it can't land in the wrong place and the expected answer can
never disagree with the sentence around it.

## Data

- **Live**: met words join `Store.minedPhrases` as `Phrase`
  entries with `kind: "word"`, `captured: { module: "Daily words", … }`, and
  their schedule in `Store.phraseSrs` — the same pool and scheduler the
  Phrasebook and News Chat share. `Store.wordDays` records each day's issued
  set; `Store.myLines` keeps the last sentence the learner wrote with each item,
  which is what `echo` gaps back to them weeks later. Clean uses tally into `Store.phraseApplied`; the streak and vocabulary
  land on `Store.profile` / `Store.vocab` via `finishWordSession`.
- **DB (ready-to-wire)**: migration `0005_daily_words.sql` adds the `daily`
  value to `phrase_source`; `saveDailyWord()` in `src/lib/server/db/phrases.ts`
  mirrors the client enrollment. The curriculum id (`w-<word>`) is the row
  slug, so a word dedupes across surfaces. Everything else it needs already
  exists on the `phrases` table.

## Code

| Piece | File |
| --- | --- |
| Day-set rules, the drill ladder, matchers, judging | `src/lib/shared/words.ts` |
| Generating the curriculum | `src/lib/server/curriculum.ts`, `src/lib/server/prompts/curriculum.ts` |
| Round builder (the one AI job) | `src/lib/server/words.ts` |
| Route | `src/app/api/words/daily/route.ts` |
| UI (home · session · debrief) | `src/components/DailyWords.tsx`, `/words` |
| Store commits | `issueWordDay`, `finishWordSession`, `recordProductions` in `src/store/StoreContext.tsx` |

### Where the curriculum comes from

There is no list to extend. `lib/server/curriculum.ts` mints a batch of ~12
words whenever the learner's queue drops below six unmet items, and stores them
in `word_items` in queue order.

The two rules the old curated list existed to encode moved into the prompt and
the coercion, because they are pedagogy rather than content:

- **Frequency first**, and never a word already met — the learner's met items go
  in as an exhaustive exclusion list, and a slug that already exists is rejected
  with the reason named so the retry can fix it.
- **One word per semantic field per batch**, checked in code. A model asked for
  "unrelated words" will still hand you three ways to be tired.

A partial batch is kept rather than retried: half a fortnight of words beats an
error page. An empty one retries once with the rejections named, then fails
honestly. To change *what kind* of words a learner meets, change the prompt —
and bump its `VERSION`, since that is what invalidates the cache.
