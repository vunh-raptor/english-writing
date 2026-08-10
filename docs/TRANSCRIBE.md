# Transcribe — write what you hear, then say it back

The one mode where the English arrives as **sound**.

Every other surface in Flowrite hands the learner text: a word card, a headline,
an article they pasted. Transcribe hands them fifteen seconds of speech and
nothing else, and asks for it back twice — once in writing, once in their own
mouth.

> **The mode in one sentence:** a learner watches fifteen seconds of a clip,
> writes down what they heard, sees exactly which words slipped, says the line
> back over the speaker's rhythm — and the clip will not advance until both are
> true.

---

## Why two gates, and why only one of them scores

The chunk gate is deliberately made of two things of **different kinds**.

**Dictation is scored.** It is the only place in the product where the learner's
output has a known right answer, so it is checked exactly — word by word, in
code, in `lib/shared/transcribe.ts`. Ninety percent word match opens the next
chunk.

**Shadowing is only witnessed.** It is recorded, played back beside the
speaker's line, and measured for exactly one thing: whether it ran long. No
pronunciation score, no percentage, no stars. This is not an oversight and it is
not a phase-two feature — the moment a number appears next to somebody's voice,
people stop using their voice, and this product exists to maximise production.

The asymmetry is the design. Score what code can check fairly; witness what it
cannot.

## The loop

```
   ┌── listen ──┐
   │            │  as many times as you like; the count is kept, not judged
   └──► write it down ──► CHECK ──► say it back ──► next chunk
                            │                          │
                       below 90%?                  every 10th?
                            │                          │
                       listen again              MILESTONE ──► debrief
```

1. **Listen.** Fifteen seconds, looped, at 1× / 0.75× / 0.5×. The replay counter
   is shown so a learner can watch it fall over a passage — that fall is the
   actual evidence of progress, more than the accuracy is.
2. **Write it down.** A plain surface, `spellCheck={false}`, no autocorrect. Two
   scaffolds are available and both cost a visible "one miss": **peek at first
   letters** (every word reduced to its initial) and **reveal one word** (the
   longest content word). Neither ever completes the line.
3. **Check.** The score, and the diff on their own text: what they wrote struck
   through, what was actually said in ochre. Never red — a tutor's pencil.
4. **Say it back.** The line with its stressed words underlined, the rhythm of
   the speaker's delivery drawn beside their own waveform. One take.
5. **Milestone**, every tenth chunk: two comprehension questions, then two
   phrases from the passage used in one sentence of the learner's own.
   Transcribing is not understanding, and this is where that gets tested.
6. **Debrief** closes the passage: chunks passed, average accuracy, listens per
   chunk, the words that kept slipping, and what goes to the Phrasebook.

## Where the content comes from

Two sources, with deliberately different postures.

**Curated clips** (`lib/shared/clips.ts`) ship their own transcripts, exactly
like the daily-word curriculum in `words.ts`: no I/O, no key, nothing to fail.
Cue timings are *derived* from the prose at a stated speaking rate rather than
hand-written, because hand-timing a thousand words invites drift between the
text and the clock, and the clock is what the chunk cut trusts.

A generated clip has no `videoId`, so it is read aloud by the browser's own
speech synthesis, and the pane says so. This is honestly a compromise — a
synthesized voice has none of the elision and connected speech that make real
narration worth transcribing — but it is what makes an endless library
possible: the passage is written for this learner at their band, and it comes
with its own transcript, so the score never depends on a model even though the
material did. A learner who wants real speech pastes a link, which is the other
half of the mode and is unchanged.

**Pasted links** use the real video and its real captions. `fetchTranscript()`
in `lib/server/transcribe.ts` parses out an eleven-character video id and builds
its *own* YouTube URL — so unlike `extract.ts`, which must fetch a host the user
chose and therefore carries full request-forgery guards, this never fetches a
user-supplied host at all. A video without captions fails honestly: it cannot be
cut, and guessing at the words would make the score a lie.

## Chunking

Fifteen seconds is a **budget, not a rule**. Cutting mid-clause would ask
somebody to transcribe half a thought, which tests short-term memory rather than
listening, so `cutIntoChunks()` lands each cut on the sentence boundary nearest
the budget — falling back to the clock only when a speaker runs on without
punctuation. Chunks are always *derived* from the stored transcript, never
stored themselves, so there is one source of truth for where every boundary
falls.

Ten chunks make a **passage**. Eighty chunks with a full exam each would be
punishing, so comprehension is asked every tenth.

## Scoring

`scoreDictation(reference, attempt)` is pure, deterministic, and the authority.

- Word tokens are aligned by longest common subsequence; a leftover extra paired
  with a leftover miss becomes one **substitution** ("warm" → **warms**), which
  is what the learner actually did.
- Accuracy is matched words over the **longer** of the two texts, so padding an
  attempt with words that were never said cannot inflate the percentage — the
  denominator grows with it.
- Comparison normalizes case, curly apostrophes and surrounding punctuation.
  Marking somebody down for a straight quote would be scoring their keyboard.

**No model gets a vote on the score.** A model that judged the transcription
could mark a correct word wrong, and there is no version of this mode that
survives that. The AI layer sits strictly downstream, naming the *pattern*
behind slips code already found.

## What the AI does, and what happens without it

| Call | Job | With no key |
| --- | --- | --- |
| `POST /api/transcribe/chunks` | Pasted link → captions | No AI involved; works regardless |
| `POST /api/transcribe/explain` | Name the pattern behind the slips | The diff shows alone — no explanation cards |
| `POST /api/transcribe/milestone` | Two questions + two phrases | `localMilestone()`: generic-shaped but real questions, phrases extracted deterministically |
| `POST /api/transcribe/judge` | Judge a milestone attempt | The deterministic phrase check alone |

The deterministic phrase check is the **floor** on judging: if code cannot find
both phrases in the learner's sentence, the milestone does not pass, whatever
the model says. The model may only withhold a pass on comprehension grounds code
cannot see. This is the same "code can rescue a production, never invent one"
rule the mission and drill engines follow.

## Data

Postgres, per account, behind RLS — like every other mode. The
`transcribe_sessions` table (migration 0006) is unique on `(user_id, clip_id)`,
so resuming a clip updates one row in place, and is bounded to 12 per learner
since each freezes a whole clip and its transcript. Progress is **chunk-granular** because
that is the unit a learner resumes at; a twenty-minute clip has to survive being
closed.

Missed words reach the shared Leitner pool through `keepMisheard()`: a word
misheard **once** is a slip and simply joins the pool; misheard **twice** it is a
gap, and only then does its schedule get knocked back so it turns up in
tomorrow's Phrasebook set. The sentence it was missed in is stored as the
example, because the learner's own moment of not hearing it is a better
retrieval cue than any sentence we could generate.

## Non-negotiables in play

- **No correction mid-flow** — the writing surface has no spellcheck and no
  grammar UI; the diff appears only after "Check it".
- **Never a blank page** — the audio is the material.
- **Nothing completes the learner's turn** — scaffolds cost a miss and never
  reveal the line; the milestone asks for *their* sentence.
- **The deterministic half stays deterministic** — the score, the diff and the
  missed-word list are computed on-device from the stored transcript, so they
  never depend on a model. What needs a provider is the *material*: the passage
  itself and the milestone that closes it. The canned two-question milestone
  that used to stand in ("what was this passage about?") could be asked of any
  passage ever written, which is precisely what the gate exists to rule out, so
  it is gone and a failure offers a retry. (Progress itself is
  server-owned — the app is account-only.)
- **Never red** — every correction is ochre, and every control is Oxford.

## Files

| Concern | File |
| --- | --- |
| Scoring, diff, chunking, passages, scaffolds | `src/lib/shared/transcribe.ts` |
| Prose → timed cues | `src/lib/shared/clips.ts` |
| Generating passages | `src/lib/server/listening.ts`, `src/lib/server/prompts/listening.ts` |
| Captions + the three AI jobs | `src/lib/server/transcribe.ts` |
| Routes | `src/app/api/transcribe/{chunks,explain,milestone,judge}/route.ts` |
| Entry + debrief | `src/components/Transcribe.tsx` |
| The split view and its four states | `src/components/TranscribeSession.tsx` |
| Playback (YouTube / speech) | `src/lib/client/player.ts`, `src/lib/client/speech.ts` |
| Shadow capture + waveform | `src/lib/client/recorder.ts` |
| Tests | `src/lib/shared/__tests__/transcribe.test.ts` |
