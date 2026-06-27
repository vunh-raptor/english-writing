# Flowrite

**Write English freely. Polish it later.**

A calm, distraction-free **freewriting** app for people learning English as a
second language. The whole design serves one goal:

> **Maximize production, minimize the anxiety that makes people quit.**

Most language apps are input-heavy (multiple choice, matching, listening). The
thing they under-serve is *output* — and producing language is exactly what
builds real grammatical competence (Swain's output hypothesis) and exactly
where the fear lives. Flowrite is built entirely around getting you to produce
English without flinching, then feel good about it.

---

## The core loop

1. **Never a blank page.** Every session opens with a leveled, *personal*
   prompt and a sentence-starter. You write about your own life and opinions —
   which is what makes writing feel meaningful (and meaning is what drives flow).
2. **Write phase.** A calm full-screen editor. **No spellcheck, no red
   squiggles, no correction mid-flow** — the generator and the editor are
   different mental modes, and switching on the editor is what kills fluency. A
   timer or word goal reframes success as *don't stop*, not *be good*. If you
   pause, a gentle "keep going" pulse nudges you (it never deletes anything).
3. **Celebrate.** The moment you finish, a juicy micro-win: confetti, a soft
   chime, count-up stats, and your streak.
4. **Feedback phase.** On-demand, opt-in, and *after* writing — it always leads
   with what went well and offers at most a couple of gentle suggestions framed
   as ideas to play with, never as errors.
5. **Habit engine.** Streaks **with forgiveness** (freeze tokens cover a missed
   day so one bad day doesn't nuke months of progress), and rewards that show
   **real growth** — "+12 new words this week", vocabulary size, sentence-length
   trends — instead of hollow points.

## How the design maps to the science

| Principle | In the app |
| --- | --- |
| Output builds competence | The entire app is a writing-output loop |
| Freewriting → fluency | Continuous writing, zero mid-flow correction |
| Kill the inner critic | `spellCheck` off; no grammar UI while writing |
| Never the blank page | Leveled prompt + sentence-starter on every session |
| Goal = momentum, not quality | Timer / word goal, "I'm done" any time |
| Flow conditions | Clear goal, instant feedback, difficulty calibrated to level |
| Private by default | Local-first; no account, no audience |
| Defer signup until after a win | No signup at all — just open and write |
| Streaks, but forgiving | Streak **freeze** tokens absorb missed days |
| Reward growth, not grinding | New words, vocabulary, sentence-length trends |
| Make the win feel great | Confetti + chime + count-up on completion |

## Privacy

Everything lives **on your device** in `localStorage` — your writing, streak,
and settings never touch a server. The only thing that ever leaves your browser
is text you *explicitly* send for AI feedback (see below).

## Optional: AI-powered feedback

The app works fully offline with on-device feedback. If you want warmer, more
personal feedback, open **Settings → AI feedback**, turn it on, and paste your
own [Anthropic API key](https://console.anthropic.com). The key is stored only
in your browser and is sent only to Anthropic, only when you ask for feedback.
It calls the Claude API directly from the browser using your own credentials
(default model: `claude-opus-4-8`).

## Run it

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

Open the printed local URL and start writing.

## Tech

- **React + TypeScript + Vite**, local-first (no backend).
- State persisted to `localStorage` via a small store context.
- AI feedback via the official `@anthropic-ai/sdk` (browser, opt-in).
- No tracking, no analytics, no account system.

### Project layout

```
src/
  App.tsx                 # view-state navigation + top bar
  types.ts                # the on-device data model
  store/StoreContext.tsx  # localStorage-backed state + "finish session" logic
  lib/
    prompts.ts            # leveled, personal prompt bank
    stats.ts              # word/sentence counts + vocabulary growth
    streak.ts             # streak engine with forgiveness (freezes)
    feedback.ts           # offline, encouragement-first feedback
    ai.ts                 # optional Claude-powered feedback
    storage.ts, date.ts, sound.ts
  components/
    Home, Write, Celebrate, Feedback, Progress, Settings, Confetti
```

---

*One honest caveat, built into the design: the output hypothesis is partly, not
fully, empirically confirmed — writing is necessary but not sufficient. So
Flowrite pairs the production loop with light, encouraging feedback rather than
treating raw output as the whole story.*
