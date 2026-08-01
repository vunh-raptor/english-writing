"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, RotateCcw } from "lucide-react";
import type {
  ChunkResult,
  DictationScore,
  DiffSegment,
  MilestoneQuiz,
  NewsLevel,
  SlipPattern,
  TranscribeChunk,
  TranscribeSession as Session,
} from "@/types";
import {
  PASS_LINE,
  clockTime,
  firstLetters,
  hardestWord,
  localMilestone,
  milestoneDue,
  passageOf,
  passageRange,
  scoreDictation,
  speechShape,
} from "@/lib/shared/transcribe";
import {
  explainDictation,
  fetchMilestone,
  judgeMilestoneAttempt,
} from "@/lib/client/clientApi";
import { createPlayer, type ChunkPlayer } from "@/lib/client/player";
import { ShadowRecorder, WAVEFORM_BARS, recordingSupported, type Take } from "@/lib/client/recorder";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The live Transcribe session (docs/TRANSCRIBE.md) — the clip on the left, the
 * work on the right, four states deep.
 *
 *   DICTATE   fifteen seconds, as many times as you need, then write it down.
 *   CHECKED   the score, and the diff on your own text. Ochre, never red.
 *   SHADOW    say it back over her rhythm. Recorded, witnessed, never scored.
 *   MILESTONE every tenth chunk: what you understood, and two of its phrases
 *             in a sentence of your own.
 *
 * The gate is deliberately two things of different kinds. Dictation is scored
 * because there is a right answer and code can check it. Shadowing is only
 * witnessed, because the moment a number appears next to someone's voice they
 * stop using it.
 */

type Step = "dictate" | "checked" | "shadow" | "milestone";
type Speed = 1 | 0.75 | 0.5;

const SPEEDS: Speed[] = [1, 0.75, 0.5];

interface Props {
  session: Session;
  chunks: TranscribeChunk[];
  level: NewsLevel;
  onSave(session: Session): void;
  /** A passage just closed — hand it to the debrief. */
  onPassageDone(passage: number): void;
  onExit(): void;
  /** Words misheard in this chunk, for tomorrow's review. */
  onMisheard(words: { text: string; heard: string }[]): void;
}

export function TranscribeSession({
  session,
  chunks,
  level,
  onSave,
  onPassageDone,
  onExit,
  onMisheard,
}: Props) {
  const [step, setStep] = useState<Step>("dictate");
  const [cursor, setCursor] = useState(session.cursor);

  // Listening.
  const [speed, setSpeed] = useState<Speed>(1);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [listens, setListens] = useState(0);

  // Writing.
  const [text, setText] = useState("");
  const [letters, setLetters] = useState(false);
  const [word, setWord] = useState(false);
  const [score, setScore] = useState<DictationScore | null>(null);
  const [patterns, setPatterns] = useState<SlipPattern[]>([]);
  const [keep, setKeep] = useState<string[]>([]);

  // Saying it back.
  const [take, setTake] = useState<Take | null>(null);
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState("");

  // The milestone.
  const [quiz, setQuiz] = useState<MilestoneQuiz | null>(null);
  const [answers, setAnswers] = useState(["", ""]);
  const [sentence, setSentence] = useState("");
  const [verdict, setVerdict] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ChunkPlayer | null>(null);
  const recorderRef = useRef<ShadowRecorder | null>(null);
  const takeRef = useRef<Take | null>(null);
  takeRef.current = take;

  const chunk = chunks[cursor];
  const passage = passageOf(cursor);
  const { from, to } = passageRange(passage, chunks.length);

  // ---- playback -------------------------------------------------------------

  useEffect(() => {
    let live = true;
    createPlayer(mountRef.current, session.clip.videoId).then((p) => {
      if (live) playerRef.current = p;
      else p.destroy();
    });
    return () => {
      live = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [session.clip.videoId]);

  // Never let audio outlive the pane that started it.
  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      recorderRef.current?.release();
    };
  }, []);

  const stopAudio = useCallback(() => {
    playerRef.current?.stop();
    setPlaying(false);
  }, []);

  const replay = useCallback(() => {
    if (!chunk) return;
    if (playing) {
      stopAudio();
      return;
    }
    setListens((n) => n + 1);
    setPlaying(true);
    playerRef.current?.play(chunk, { rate: speed, loop, onEnd: () => setPlaying(false) });
  }, [chunk, playing, speed, loop, stopAudio]);

  // A speed or loop change mid-listen should take effect now, not next time.
  useEffect(() => {
    if (!playing || !chunk) return;
    playerRef.current?.play(chunk, { rate: speed, loop, onEnd: () => setPlaying(false) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, loop]);

  // ---- the gate -------------------------------------------------------------

  /** Everything that resets when the ear moves to a new chunk. */
  const resetChunk = useCallback(() => {
    setText("");
    setLetters(false);
    setWord(false);
    setScore(null);
    setPatterns([]);
    setKeep([]);
    setListens(0);
    setTake(null);
    setMicError("");
    setQuiz(null);
    setAnswers(["", ""]);
    setSentence("");
    setVerdict("");
  }, []);

  function check() {
    if (!chunk || !text.trim()) return;
    stopAudio();
    const result = scoreDictation(chunk.text, text);
    setScore(result);
    setStep("checked");

    // The explanation is a bonus on top of a score that already exists, so it
    // is fetched after the fact and its failure is silent.
    if (result.missed.length > 0) {
      explainDictation(level, chunk.text, text, result.missed)
        .then((r) => {
          setPatterns(r.patterns);
          setKeep(r.keep);
        })
        .catch(() => {
          setPatterns([]);
          setKeep([]);
        });
    }
  }

  async function toShadow() {
    stopAudio();
    setStep("shadow");
  }

  async function record() {
    setMicError("");
    if (recording) {
      try {
        const t = await recorderRef.current!.stop();
        if (takeRef.current) URL.revokeObjectURL(takeRef.current.url);
        setTake(t);
      } catch {
        setMicError("That take didn't save. Try once more.");
      } finally {
        setRecording(false);
        recorderRef.current = null;
      }
      return;
    }
    stopAudio();
    const rec = new ShadowRecorder();
    try {
      await rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      rec.release();
      setMicError("No microphone here — mark it said and carry on.");
    }
  }

  /** Commit this chunk and move the ear on. */
  const advance = useCallback(
    (result: ChunkResult) => {
      const results = { ...session.results, [result.index]: result };
      const next = Math.min(cursor + 1, chunks.length - 1);
      const done = cursor >= chunks.length - 1;

      onSave({
        ...session,
        results,
        cursor: done ? cursor : next,
        status: done ? "complete" : "active",
      });
      if (result.missed.length > 0 && chunk) {
        onMisheard(result.missed.map((w) => ({ text: w, heard: chunk.text })));
      }

      if (milestoneDue(cursor, chunks.length)) {
        openMilestone();
        return;
      }
      resetChunk();
      setCursor(next);
      setStep("dictate");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, cursor, chunks.length, chunk, onSave, onMisheard, resetChunk],
  );

  function unlock() {
    if (!score) return;
    advance({
      index: cursor,
      accuracy: score.accuracy,
      listens,
      aided: letters || word,
      shadowed: !!take,
      missed: score.missed,
    });
  }

  async function openMilestone() {
    setStep("milestone");
    setBusy(true);
    const passageText = chunks
      .slice(from, to + 1)
      .map((c) => c.text)
      .join(" ");
    try {
      setQuiz(await fetchMilestone(level, passageText));
    } catch {
      // No key, no network, or a bad response — the passage still closes.
      setQuiz(localMilestone(passageText));
    } finally {
      setBusy(false);
    }
  }

  async function submitMilestone() {
    if (!quiz || busy) return;
    setBusy(true);
    setVerdict("");
    try {
      const result = await judgeMilestoneAttempt(level, quiz, answers, sentence);
      if (!result.passed) {
        setVerdict(result.note);
        return;
      }
      finishPassage();
    } catch {
      // Judging is unavailable: fall back to the deterministic floor, which is
      // the only part that was ever binding anyway.
      const used = quiz.phrases.filter((p) =>
        sentence.toLowerCase().includes(p.toLowerCase()),
      );
      if (used.length < quiz.phrases.length) {
        setVerdict("Both phrases need to turn up in a sentence that's yours.");
        return;
      }
      finishPassage();
    } finally {
      setBusy(false);
    }
  }

  function finishPassage() {
    const passed = [...session.milestonesPassed, passage];
    const done = cursor >= chunks.length - 1;
    onSave({
      ...session,
      milestonesPassed: passed,
      cursor: done ? cursor : cursor + 1,
      status: done ? "complete" : "active",
    });
    onPassageDone(passage);
  }

  // ---- derived --------------------------------------------------------------

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const speakerBars = useMemo(
    () => (chunk ? speechShape(chunk.text, WAVEFORM_BARS) : []),
    [chunk],
  );
  const beats: Step[] = ["dictate", "checked", "shadow", "milestone"];
  const beatIndex = beats.indexOf(step);

  if (!chunk) return null;

  const kicker = {
    dictate: `Chunk ${cursor + 1} of ${chunks.length} · Dictation`,
    checked: `Chunk ${cursor + 1} · Checked`,
    shadow: `Chunk ${cursor + 1} · Say it back`,
    milestone: `Milestone ${passage + 1} · Passage check`,
  }[step];

  const meta = {
    dictate: `${clockTime(chunk.start)} → ${clockTime(chunk.end)}`,
    checked: `${listens} ${listens === 1 ? "listen" : "listens"} · 1 attempt`,
    shadow: "one take is enough",
    milestone: `chunks ${from + 1}–${to + 1} · locked until you pass`,
  }[step];

  return (
    <div className="lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      {/* ── the clip ─────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-col gap-3.5 border-b border-border bg-background px-6 py-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div>
          <button
            type="button"
            onClick={onExit}
            className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            ‹ Transcribe
          </button>
          <div className="mt-2 font-serif text-[19px] font-medium leading-tight text-foreground">
            {session.clip.title}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            {session.clip.source} · {clockTime(session.clip.duration)} · {session.clip.level}
          </div>
        </div>

        <div className="relative aspect-video w-full flex-none bg-muted">
          <div ref={mountRef} className="absolute inset-0 h-full w-full" />
          {/* The voice placeholder gives way to the lock — two overlays on one
              frame would read as neither. */}
          {!session.clip.videoId && step !== "milestone" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <div
                className={cn(
                  "font-mono text-[11px] uppercase tracking-[0.12em]",
                  playing ? "text-gold" : "text-muted-foreground",
                )}
              >
                {playing ? "Playing · chunk " + (cursor + 1) : "Read aloud · no video"}
              </div>
              <div className="font-serif text-[17px] italic text-muted-foreground">
                This clip is read by your browser&rsquo;s own voice.
              </div>
            </div>
          )}
          {step === "milestone" && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/85">
              <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-gold">
                Milestone {passage + 1} · locked
              </div>
              <div className="font-serif text-[19px] italic text-background">
                Pass the check to keep going
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={replay} className="h-[30px] gap-1.5 px-3">
              <RotateCcw className="size-3.5" />
              {playing ? "Stop" : "Replay chunk"}
            </Button>
            <button
              type="button"
              onClick={() => setLoop((v) => !v)}
              aria-pressed={loop}
              className={cn(
                "h-[30px] px-3 text-[13px] font-semibold transition-colors",
                loop
                  ? "bg-oxford-tint text-brand-ink shadow-[inset_0_0_0_1px_hsl(var(--oxford-line))]"
                  : "bg-card text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]",
              )}
            >
              Loop
            </button>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex gap-px">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={cn(
                    "h-[26px] px-2.5 font-mono text-[11px] transition-colors",
                    speed === s
                      ? "bg-primary font-medium text-primary-foreground"
                      : "bg-card text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]",
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {listens} listens
            </span>
          </div>
        </div>

        <Timeline chunks={chunks} cursor={cursor} results={session.results} />

        <div className="bg-card p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="kicker">
              Passage {passage + 1} · chunks {from + 1}–{to + 1}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {session.milestonesPassed.length} passed
            </span>
          </div>
          <PassageStrip
            from={from}
            to={to}
            cursor={cursor}
            results={session.results}
            milestone={step === "milestone"}
            passageLabel={`M${passage + 1}`}
          />
          <p className="mt-2.5 text-[12.5px] leading-snug text-muted-foreground">
            {step === "milestone"
              ? "All of them written and said back. The milestone is the only thing between you and the next passage."
              : `Chunk ${cursor + 2 <= chunks.length ? cursor + 2 : cursor + 1} opens when this one is written and said back.`}
          </p>
        </div>

        <div className="mt-auto flex items-baseline justify-between pt-2 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
          <span>
            Passage {passage + 1} of {Math.ceil(chunks.length / 10)}
          </span>
          <span>{summarize(session.results)}</span>
        </div>
      </section>

      {/* ── the work ─────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-col bg-background px-6 py-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-8">
        <div className="flex items-baseline justify-between gap-3">
          <span className="kicker">{kicker}</span>
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            {meta}
          </span>
        </div>

        <div className="mt-3 flex gap-1.5">
          {beats.map((b, i) => (
            <span
              key={b}
              className={cn(
                "h-1 flex-1",
                i < beatIndex ? "bg-primary" : i === beatIndex ? "bg-gold" : "bg-border",
              )}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
          <span className="flex-1">Write it down</span>
          <span className="flex-1">Check</span>
          <span className="flex-1">Say it back</span>
          <span className="flex-1">Milestone</span>
        </div>

        {step === "dictate" && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <h2 className="font-serif text-2xl font-medium leading-tight tracking-tight text-foreground">
              Write down every word you heard.
            </h2>
            <p className="mt-1.5 max-w-[520px] text-sm leading-normal text-muted-foreground">
              The score counts words — punctuation is for your own ear. Listen as many
              times as you like; the count is kept so you can watch it fall, not so you
              can be marked down.
            </p>

            {letters && (
              <div className="mt-3.5 border-l-2 border-gold bg-ochre-tint px-3.5 py-2.5">
                <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-gold">
                  First letters · counts as one miss
                </div>
                <p className="mt-1 font-mono text-sm leading-relaxed tracking-wide text-foreground">
                  {firstLetters(chunk.text)}
                </p>
              </div>
            )}

            {word && (
              <div className="mt-3.5 flex flex-wrap items-baseline gap-3 border-l-2 border-gold bg-ochre-tint px-3.5 py-2.5">
                <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-gold">
                  One word
                </div>
                <div className="font-serif text-[19px] text-foreground">{hardestWord(chunk.text)}</div>
                <div className="text-[12.5px] text-muted-foreground">
                  — the hardest one in this chunk. It also counts as one miss.
                </div>
              </div>
            )}

            <div className="mt-4 flex min-h-[220px] flex-1 flex-col bg-oxford-tint px-5 py-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                placeholder="Type what you heard…"
                aria-label="What you heard"
                className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent font-sans text-[17px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Stuck?
                </span>
                <ScaffoldButton on={letters} onClick={() => setLetters((v) => !v)}>
                  Peek at first letters
                </ScaffoldButton>
                <ScaffoldButton on={word} onClick={() => setWord((v) => !v)}>
                  Reveal one word
                </ScaffoldButton>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {wordCount} words
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <p className="text-[13px] text-muted-foreground">
                The pass line is {PASS_LINE}% of the words. Below it, you listen again.
              </p>
              <Button size="lg" onClick={check} disabled={!text.trim()}>
                Check it
              </Button>
            </div>
          </div>
        )}

        {step === "checked" && score && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-[46px] font-semibold leading-none tracking-tight text-foreground">
                    {score.accuracy}%
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    word match · pass line {PASS_LINE}%
                  </span>
                </div>
                <p className="mt-2 max-w-[440px] text-sm leading-normal text-muted-foreground">
                  {slipSummary(score)}
                </p>
              </div>
              <span
                className={cn(
                  "flex-none px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]",
                  score.passed ? "bg-oxford-tint text-brand-ink" : "bg-ochre-tint text-gold",
                )}
              >
                {score.passed ? `✓ chunk ${cursor + 2} within reach` : "listen again"}
              </span>
            </div>

            <div className="mt-4 bg-card px-6 py-5">
              <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                What you wrote
              </div>
              <p className="mt-2 text-[17px] leading-relaxed text-foreground">
                <DiffText segments={score.segments} />
              </p>
            </div>

            {patterns.length > 0 && (
              <div className="mt-3.5 flex flex-col gap-px">
                {patterns.map((p) => (
                  <div key={p.label} className="bg-ochre-tint px-4 py-3">
                    <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-gold">
                      {p.label}
                    </div>
                    <p className="mt-1 text-[14.5px] leading-normal text-foreground">{p.note}</p>
                  </div>
                ))}
              </div>
            )}

            {keep.length > 0 && (
              <div className="mt-4">
                <div className="kicker">Kept for tomorrow</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {keep.map((k) => (
                    <span
                      key={k}
                      className="border border-input bg-card px-2.5 py-1 text-[13.5px] text-foreground"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  setScore(null);
                  setStep("dictate");
                }}
              >
                Listen again
              </Button>
              {score.passed && (
                <Button size="lg" onClick={toShadow}>
                  Say it back →
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "shadow" && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <h2 className="font-serif text-2xl font-medium leading-tight tracking-tight text-foreground">
              Now say it back, over her.
            </h2>
            <p className="mt-1.5 max-w-[520px] text-sm leading-normal text-muted-foreground">
              One take is enough. Nothing scores this — the point is that your mouth
              makes the shape once, at her speed.
            </p>

            <div className="mt-4 bg-card px-6 py-5">
              <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                Chunk {cursor + 1} · stress on the underlined
              </div>
              <p className="mt-2.5 text-[19px] leading-relaxed text-foreground">
                <StressedText text={chunk.text} stress={chunk.stress} />
              </p>
            </div>

            <div className="mt-4 bg-card px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Her · {(chunk.end - chunk.start).toFixed(1)}s
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  the rhythm of the line
                </div>
              </div>
              <Waveform peaks={speakerBars} tone="reference" />

              <div className="mt-5 flex items-center justify-between gap-4">
                <div
                  className={cn(
                    "font-mono text-[9.5px] font-medium uppercase tracking-[0.1em]",
                    take ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {take ? `You · ${take.seconds.toFixed(1)}s` : "You · nothing yet"}
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {take ? compareLength(take.seconds, chunk.end - chunk.start) : "—"}
                </div>
              </div>
              <Waveform
                peaks={take?.peaks.length ? take.peaks : new Array(WAVEFORM_BARS).fill(0.06)}
                tone={take ? "you" : "empty"}
              />
              {take && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio src={take.url} controls className="mt-3 h-9 w-full" />
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3.5">
              <Button
                size="lg"
                variant={take ? "secondary" : "default"}
                onClick={record}
                disabled={!recordingSupported() && !take}
                className="gap-2.5"
              >
                <Mic className={cn("size-4", recording && "animate-pulse text-gold")} />
                {recording ? "Stop the take" : take ? "Record again" : "Record your take"}
              </Button>
              <p className="max-w-[320px] text-[13px] leading-snug text-muted-foreground">
                {micError ||
                  (recording
                    ? "Recording. Speak along with her."
                    : take
                      ? "Kept. Play it back against hers above."
                      : "Press, then speak along with her.")}
              </p>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
              <Button variant="ghost" size="lg" onClick={() => setStep("checked")}>
                ‹ Back to the check
              </Button>
              <Button size="lg" onClick={unlock} disabled={!take && !micError}>
                {milestoneDue(cursor, chunks.length)
                  ? "To the milestone →"
                  : `Unlock chunk ${cursor + 2} →`}
              </Button>
            </div>
          </div>
        )}

        {step === "milestone" && (
          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <h2 className="font-serif text-2xl font-medium leading-tight tracking-tight text-foreground">
              That&rsquo;s the passage. Show me what stayed.
            </h2>
            <p className="mt-1.5 max-w-[520px] text-sm leading-normal text-muted-foreground">
              Transcribing is not understanding. Two questions about the passage, then two
              of its phrases in a sentence that is yours — and the next passage opens.
            </p>

            {busy && !quiz ? (
              <div className="mt-8 flex items-center gap-3 text-muted-foreground">
                <span className="spinner spinner-sm" />
                <span className="text-sm">Setting the check…</span>
              </div>
            ) : quiz ? (
              <>
                <div className="mt-4 bg-card px-6 py-5">
                  <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    What you understood
                  </div>
                  <div className="mt-3.5 flex flex-col gap-4">
                    {quiz.questions.map((q, i) => (
                      <div key={q} className="flex items-baseline gap-3">
                        <span className="flex-none font-mono text-[10px] text-muted-foreground">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-serif text-[17px] leading-snug text-foreground">{q}</p>
                          <input
                            value={answers[i] ?? ""}
                            onChange={(e) =>
                              setAnswers((a) => a.map((v, k) => (k === i ? e.target.value : v)))
                            }
                            spellCheck={false}
                            placeholder="Two lines is plenty…"
                            aria-label={q}
                            className="mt-2 w-full border-0 border-b border-input bg-transparent pb-1.5 text-[15px] text-foreground outline-none focus:border-primary placeholder:italic placeholder:text-muted-foreground/70"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3.5 flex min-h-0 flex-1 flex-col bg-card px-6 py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      What you can use
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      both, one sentence, about anything
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {quiz.phrases.map((p) => (
                      <span
                        key={p}
                        className="bg-oxford-tint px-2.5 py-1 text-sm font-semibold text-brand-ink"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                  <textarea
                    value={sentence}
                    onChange={(e) => setSentence(e.target.value)}
                    spellCheck={false}
                    placeholder="Your sentence — not about this clip, if you can help it."
                    aria-label="Your sentence"
                    className="mt-3 min-h-[88px] w-full flex-1 resize-none bg-oxford-tint px-4 py-3.5 text-base leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
                  />
                </div>

                {verdict && (
                  <p className="note note-warning mt-3">{verdict}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                  <p className="text-[13px] text-muted-foreground">
                    Nothing here is skipped. A miss just sends you back for another listen.
                  </p>
                  <Button size="lg" onClick={submitMilestone} disabled={busy || !sentence.trim()}>
                    {busy ? "Checking…" : `Unlock passage ${passage + 2} →`}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ScaffoldButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-[30px] px-3 text-[13px] font-semibold transition-colors",
        on
          ? "border border-gold bg-ochre-tint text-gold"
          : "border border-input bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

/** The whole clip as one tick per chunk — precise, and deliberately dense. */
function Timeline({
  chunks,
  cursor,
  results,
}: {
  chunks: TranscribeChunk[];
  cursor: number;
  results: Record<number, ChunkResult>;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10.5px] tracking-wide text-muted-foreground">
        <span>00:00</span>
        <span className="font-medium text-gold">
          {clockTime(chunks[cursor].start)} → {clockTime(chunks[cursor].end)}
        </span>
        <span>{clockTime(chunks[chunks.length - 1].end)}</span>
      </div>
      <div className="mt-2 flex h-8 items-end">
        {chunks.map((c, i) => {
          const done = !!results[i];
          const now = i === cursor;
          return (
            <span
              key={c.index}
              className={cn(
                "w-0 flex-1",
                now ? "h-[30px] bg-gold" : done ? "h-[22px] bg-primary" : "h-[15px] bg-input",
                (i + 1) % 10 === 0 && i < chunks.length - 1 ? "mr-[5px]" : "mr-px",
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-primary" />
          passed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-gold" />
          here now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 bg-input" />
          locked
        </span>
        <span className="ml-auto">
          {chunks.length} chunks · {Math.round(chunks[0].end - chunks[0].start)}s each
        </span>
      </div>
    </div>
  );
}

/** The current passage, zoomed — the strip you actually navigate by. */
function PassageStrip({
  from,
  to,
  cursor,
  results,
  milestone,
  passageLabel,
}: {
  from: number;
  to: number;
  cursor: number;
  results: Record<number, ChunkResult>;
  milestone: boolean;
  passageLabel: string;
}) {
  const cells = Array.from({ length: to - from + 1 }, (_, k) => from + k);
  return (
    <div className="mt-2.5 flex gap-0.5">
      {cells.map((n) => {
        const done = !!results[n];
        const now = !milestone && n === cursor;
        return (
          <span
            key={n}
            className={cn(
              "grid h-[38px] flex-1 place-items-center font-mono text-[11px]",
              done
                ? "bg-primary text-primary-foreground"
                : now
                  ? "bg-ochre-tint font-medium text-gold shadow-[inset_0_0_0_2px_hsl(var(--ochre))]"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {n + 1}
          </span>
        );
      })}
      <span
        className={cn(
          "ml-1.5 grid h-[38px] w-[76px] flex-none place-items-center font-mono text-[11px] font-medium",
          milestone
            ? "bg-ochre-tint text-gold shadow-[inset_0_0_0_2px_hsl(var(--ochre))]"
            : "bg-muted text-muted-foreground",
        )}
      >
        {passageLabel}
      </span>
    </div>
  );
}

function Waveform({ peaks, tone }: { peaks: number[]; tone: "reference" | "you" | "empty" }) {
  return (
    <div className="mt-2 flex h-[52px] items-end gap-px" aria-hidden="true">
      {peaks.map((p, i) => (
        <span
          key={i}
          className={cn(
            "w-0 flex-1",
            tone === "reference" ? "bg-input" : tone === "you" ? "bg-primary" : "bg-muted",
          )}
          style={{ height: `${Math.max(3, Math.round(p * 46))}px` }}
        />
      ))}
    </div>
  );
}

/**
 * The learner's own text, annotated. Ochre is the tutor's pencil: a correction
 * carries the wavy underline the whole app uses for grammar, and what they
 * wrote is struck rather than deleted, so they can see the two side by side.
 */
function DiffText({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "ok") return <span key={i}>{seg.heard} </span>;
        if (seg.kind === "extra")
          return (
            <span key={i} className="text-muted-foreground line-through decoration-gold">
              {seg.wrote}{" "}
            </span>
          );
        return (
          <span key={i}>
            {seg.kind === "fix" && (
              <span className="text-muted-foreground line-through decoration-gold">
                {seg.wrote}{" "}
              </span>
            )}
            <b className="annot-issue font-semibold text-gold">{seg.heard}</b>{" "}
          </span>
        );
      })}
    </>
  );
}

/** The line to shadow, with the stressed words underlined in Oxford. */
function StressedText({ text, stress }: { text: string; stress: string[] }) {
  const marked = new Set(stress.map((w) => w.toLowerCase()));
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, i) => {
        const bare = part.replace(/[^\p{L}\p{N}'’-]/gu, "").toLowerCase();
        if (!bare || !marked.has(bare)) return <span key={i}>{part}</span>;
        return (
          <u
            key={i}
            className="underline decoration-primary decoration-2 underline-offset-4"
          >
            {part}
          </u>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

function slipSummary(score: DictationScore): string {
  const slips = score.segments.filter((s) => s.kind !== "ok").length;
  if (slips === 0) return `Every one of the ${score.total} words, exactly as she said them.`;
  const word = slips === 1 ? "slip" : "slips";
  return `${slips} ${word} in ${score.total} words. The ochre is what she actually said.`;
}

function compareLength(you: number, hers: number): string {
  const delta = you - hers;
  if (Math.abs(delta) < 0.3) return "right on her length";
  return delta > 0
    ? `${delta.toFixed(1)}s long — she takes the pauses faster`
    : `${Math.abs(delta).toFixed(1)}s short — she lingers more than you did`;
}

function summarize(results: Record<number, ChunkResult>): string {
  const all = Object.values(results);
  if (all.length === 0) return "first chunk";
  const avg = Math.round(all.reduce((n, r) => n + r.accuracy, 0) / all.length);
  const listens = (all.reduce((n, r) => n + r.listens, 0) / all.length).toFixed(1);
  return `avg ${avg}% · ${listens} listens per chunk`;
}
