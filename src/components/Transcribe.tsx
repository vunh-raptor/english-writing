"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/store/StoreContext";
import type {
  ChunkResult,
  NewsLevel,
  TranscribeChunk,
  TranscribeClip,
  TranscribeSession as Session,
} from "@/types";
import { CLIPS } from "@/lib/shared/clips";
import {
  CHUNKS_PER_PASSAGE,
  CHUNK_SECONDS,
  PASS_LINE,
  clockTime,
  cutIntoChunks,
  passageRange,
} from "@/lib/shared/transcribe";
import { fetchClipCues } from "@/lib/client/clientApi";
import { todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { TranscribeSession } from "@/components/TranscribeSession";

/**
 * Transcribe (docs/TRANSCRIBE.md) — the mode where the English arrives as sound.
 *
 *   ENTRY     pick a curated clip, paste a link, or resume where the ear left off.
 *   SESSION   the split view: the clip on the left, the writing on the right.
 *   DEBRIEF   what a passage cost and what it left behind.
 *
 * Curated clips carry their own transcripts, so the mode runs with no account,
 * no network and no keys — the same offline posture as Daily words, and for the
 * same reason: a habit that needs a connection isn't a habit.
 */

type View = "entry" | "session" | "debrief";
type Intake = "clips" | "link";

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function Transcribe() {
  const { store, saveTranscribeSession, keepMisheard } = useStore();
  const level: NewsLevel = store.newsLevel;

  const [view, setView] = useState<View>("entry");
  const [intake, setIntake] = useState<Intake>("clips");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [debriefPassage, setDebriefPassage] = useState(0);

  /** Chunks are derived from the frozen transcript, never stored — one source
   *  of truth for where every boundary falls. */
  const chunks: TranscribeChunk[] = useMemo(
    () => (session ? cutIntoChunks(session.clip.cues, session.chunkSeconds) : []),
    [session],
  );

  const resumable = useMemo(
    () => store.transcribeSessions.find((s) => s.status === "active"),
    [store.transcribeSessions],
  );

  const start = useCallback(
    (clip: TranscribeClip, existing?: Session) => {
      const next: Session =
        existing ?? {
          id: makeId(),
          day: todayKey(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          clipId: clip.id,
          clip,
          chunkSeconds: CHUNK_SECONDS,
          chunkCount: cutIntoChunks(clip.cues, CHUNK_SECONDS).length,
          cursor: 0,
          results: {},
          milestonesPassed: [],
          status: "active",
        };
      setSession(next);
      saveTranscribeSession(next);
      setView("session");
    },
    [saveTranscribeSession],
  );

  async function startFromLink() {
    if (busy || !url.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { videoId, title, cues } = await fetchClipCues(url.trim());
      start({
        id: `yt-${videoId}`,
        title,
        source: "Your link",
        videoId,
        level,
        blurb: "Pasted by you.",
        duration: Math.ceil(cues[cues.length - 1]?.end ?? 0),
        cues,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^\d+\s*/, "")
          : "That link couldn't be cut into chunks.",
      );
    } finally {
      setBusy(false);
    }
  }

  const onSave = useCallback(
    (next: Session) => {
      setSession(next);
      saveTranscribeSession(next);
    },
    [saveTranscribeSession],
  );

  if (view === "session" && session) {
    return (
      <TranscribeSession
        session={session}
        chunks={chunks}
        level={level}
        onSave={onSave}
        onMisheard={keepMisheard}
        onPassageDone={(passage) => {
          setDebriefPassage(passage);
          setView("debrief");
        }}
        onExit={() => setView("entry")}
      />
    );
  }

  if (view === "debrief" && session) {
    return (
      <Debrief
        session={session}
        chunks={chunks}
        passage={debriefPassage}
        onContinue={() => setView(session.status === "complete" ? "entry" : "session")}
        onExit={() => setView("entry")}
      />
    );
  }

  // ---- entry ---------------------------------------------------------------

  return (
    <PageContainer width="wide">
      <div>
        <div className="kicker">Learn · Transcribe</div>
        <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-tight tracking-tight text-foreground">
          Write what you hear. Then say it back.
        </h1>
        <p className="mt-1.5 max-w-[600px] text-[15px] leading-normal text-muted-foreground">
          Fifteen seconds at a time. You type what you heard, then you say it back in your
          own mouth — and the clip only moves on when both are true.
        </p>
      </div>

      <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <div className="flex gap-4 border-b border-input pb-2.5">
            {(["clips", "link"] as Intake[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setIntake(t)}
                className={cn(
                  "border-b-2 pb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors",
                  intake === t
                    ? "border-primary text-brand-ink"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "clips" ? "Today's clips" : "Paste a link"}
              </button>
            ))}
          </div>

          {intake === "clips" ? (
            <>
              <div className="mt-4 flex flex-col gap-px">
                {CLIPS.map((clip, i) => (
                  <ClipRow key={clip.id} clip={clip} primary={i === 0} onStart={() => start(clip)} />
                ))}
              </div>
              <p className="mt-4 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                {CHUNK_SECONDS}-second chunks · a milestone every {CHUNKS_PER_PASSAGE} · nothing skipped
              </p>
            </>
          ) : (
            <div className="mt-6">
              <div className="kicker">Or bring your own</div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-b-2 border-input py-2">
                <span className="flex-none font-mono text-[13px] text-muted-foreground">▸</span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startFromLink()}
                  spellCheck={false}
                  placeholder="https://…"
                  aria-label="A YouTube link"
                  className="min-w-0 flex-1 border-0 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={startFromLink}
                  disabled={busy || !url.trim()}
                >
                  {busy ? "Cutting…" : "Cut into chunks"}
                </Button>
              </div>
              {error && <p className="note note-warning mt-3 max-w-[520px]">{error}</p>}
              <p className="mt-2.5 max-w-[520px] text-[13px] leading-normal text-muted-foreground">
                Paste a YouTube link and its captions are cut into {CHUNK_SECONDS}-second
                chunks on sentence boundaries, then grouped into passages. Videos without
                captions can&rsquo;t be cut — pick one from Today&rsquo;s clips when that
                happens.
              </p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          {resumable && (
            <div className="bg-card p-6">
              <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">
                Where you left off
              </div>
              <div className="mt-2.5 font-serif text-[17px] font-medium leading-tight text-foreground">
                {resumable.clip.title}
              </div>
              <ResumeMeta session={resumable} />
              <Button
                className="mt-4 h-10 w-full text-[15px]"
                onClick={() => start(resumable.clip, resumable)}
              >
                Resume at {clockTime(
                  cutIntoChunks(resumable.clip.cues, resumable.chunkSeconds)[resumable.cursor]
                    ?.start ?? 0,
                )}
              </Button>
            </div>
          )}

          <div className="bg-card p-6">
            <div className="kicker">How this works</div>
            <ol className="mt-3 flex list-none flex-col gap-2.5 p-0">
              {[
                ["Listen", "Fifteen seconds, as many times as you need. The count is kept, not judged."],
                ["Write it down", `Every word you heard. ${PASS_LINE} percent opens the next chunk.`],
                ["Say it back", "One take, over the speaker's own rhythm. Nothing scores it — you just have to do it."],
                ["Pass the milestone", `Every ${CHUNKS_PER_PASSAGE}th chunk asks what you understood, and asks you to use two of its phrases.`],
              ].map(([title, body], i) => (
                <li key={title} className="flex items-baseline gap-2.5">
                  <span className="flex-none font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <span className="text-[13.5px] font-semibold text-foreground">{title}</span>
                    <p className="text-[12.5px] leading-snug text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3.5 border-t border-border pt-3 text-[12.5px] leading-normal text-muted-foreground">
              Words you mishear twice go to your{" "}
              <Link href="/phrasebook" className="text-brand hover:underline">
                Phrasebook
              </Link>{" "}
              on tomorrow&rsquo;s schedule.
            </p>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------

function ClipRow({
  clip,
  primary,
  onStart,
}: {
  clip: TranscribeClip;
  primary: boolean;
  onStart: () => void;
}) {
  const chunks = cutIntoChunks(clip.cues, CHUNK_SECONDS).length;
  return (
    <div className="flex flex-wrap items-center gap-4 bg-card p-3.5">
      <div className="grid h-[94px] w-[168px] flex-none place-items-center bg-muted px-3 text-center">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {clip.videoId ? "Video" : "Read aloud"}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="font-serif text-[17px] font-medium leading-tight text-foreground">
          {clip.title}
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
          {clip.source} · {clockTime(clip.duration)} · {chunks} chunks · {clip.level}
        </div>
        <div className="text-[13.5px] leading-normal text-muted-foreground">{clip.blurb}</div>
      </div>
      <div className="flex flex-none items-center">
        <Button variant={primary ? "default" : "secondary"} size="sm" onClick={onStart}>
          Start
        </Button>
      </div>
    </div>
  );
}

function ResumeMeta({ session }: { session: Session }) {
  const total = session.chunkCount || 1;
  const done = Object.keys(session.results).length;
  const pct = Math.round((done / total) * 100);
  const accuracies = Object.values(session.results).map((r) => r.accuracy);
  const avg = accuracies.length
    ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
    : 0;
  return (
    <>
      <div className="mt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
        Chunk {session.cursor + 1} of {total}
      </div>
      <div className="mt-3 h-1 bg-border">
        <div className="h-1 bg-gold" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
        {pct}%{avg > 0 && ` · avg ${avg}% accuracy`}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Debrief
// ---------------------------------------------------------------------------

function Debrief({
  session,
  chunks,
  passage,
  onContinue,
  onExit,
}: {
  session: Session;
  chunks: TranscribeChunk[];
  passage: number;
  onContinue: () => void;
  onExit: () => void;
}) {
  const { from, to } = passageRange(passage, chunks.length);
  const results = Object.values(session.results).filter(
    (r) => r.index >= from && r.index <= to,
  );

  const avg = results.length
    ? Math.round(results.reduce((n, r) => n + r.accuracy, 0) / results.length)
    : 0;
  const listens = results.length
    ? (results.reduce((n, r) => n + r.listens, 0) / results.length).toFixed(1)
    : "0";

  // What kept slipping: the same word missed across more than one chunk is a
  // gap, not a slip, and it is the thing worth showing back.
  const slips = useMemo(() => tallyMissed(results), [results]);
  const kept = slips.map((s) => s.word);
  const complete = session.status === "complete";
  const first = results[0];
  const last = results[results.length - 1];

  return (
    <PageContainer>
      <button
        type="button"
        onClick={onExit}
        className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        ‹ Transcribe
      </button>

      <div className="mt-5 bg-card px-8 py-10 sm:px-14">
        <div className="kicker">Passage {passage + 1} · debrief</div>
        <h2 className="mt-2.5 font-serif text-[28px] font-medium leading-tight tracking-tight text-foreground">
          {minutesOf(chunks, from, to)} of her English, in your own hand.
        </h2>
        <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
          {session.clip.title} · {clockTime(chunks[from]?.start ?? 0)}–
          {clockTime(chunks[to]?.end ?? 0)}
        </p>

        <div className="mt-7 grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4">
          <Stat value={String(results.length)} label="chunks passed" />
          <Stat value={`${avg}%`} label="avg accuracy" />
          <Stat value={listens} label="listens per chunk" />
          <Stat value={String(kept.length)} label="words kept" gold />
        </div>

        {first && last && first !== last && (
          <p className="mt-6 font-serif text-lg leading-snug text-brand-ink">
            {listenTrend(first, last)}
          </p>
        )}

        {slips.length > 0 && (
          <div className="mt-7">
            <div className="kicker">What kept slipping</div>
            <div className="mt-3 flex flex-col gap-2.5">
              {slips.map((s) => (
                <div key={s.word} className="flex items-center gap-3.5">
                  <span className="w-[180px] flex-none truncate text-sm text-foreground sm:w-[230px]">
                    {s.word}
                  </span>
                  <span className="h-1.5 flex-1 bg-muted">
                    <span
                      className="block h-1.5 bg-gold"
                      style={{ width: `${(s.count / slips[0].count) * 100}%` }}
                    />
                  </span>
                  <span className="w-16 flex-none text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {s.count} {s.count === 1 ? "chunk" : "chunks"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {kept.length > 0 && (
          <div className="mt-7 border-t border-input pt-6">
            <div className="kicker">Tomorrow&rsquo;s review · from this passage</div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {kept.map((w) => (
                <span
                  key={w}
                  className="border border-input bg-card px-2.5 py-1 text-[13.5px] text-foreground"
                >
                  {w}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-normal text-muted-foreground">
              They come back in tomorrow&rsquo;s{" "}
              <Link href="/phrasebook" className="text-brand hover:underline">
                Phrasebook
              </Link>{" "}
              set.
            </p>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-input pt-6">
          <p className="text-[13.5px] text-muted-foreground">
            {complete
              ? "That's the whole clip — every chunk written and said back."
              : `${chunks.length - to - 1} chunks left · about ${minutesOf(chunks, to + 1, chunks.length - 1)} of clip.`}
          </p>
          <Button size="lg" onClick={onContinue}>
            {complete ? "Pick another clip →" : `Start passage ${passage + 2} →`}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

function Stat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className="bg-card py-4 pr-2">
      <div
        className={cn(
          "font-serif text-3xl font-semibold leading-none",
          gold ? "text-gold" : "text-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

/** Words missed in more than one chunk, worst first. */
function tallyMissed(results: ChunkResult[]): { word: string; count: number }[] {
  const counts = new Map<string, { word: string; count: number }>();
  for (const r of results) {
    for (const w of r.missed) {
      const key = w.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { word: w, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
}

function minutesOf(chunks: TranscribeChunk[], from: number, to: number): string {
  const seconds = (chunks[to]?.end ?? 0) - (chunks[from]?.start ?? 0);
  const mins = seconds / 60;
  if (mins < 1) return `${Math.round(seconds)} seconds`;
  return `${mins < 2 ? "Just over a minute" : `${Math.round(mins)} minutes`}`;
}

function listenTrend(first: ChunkResult, last: ChunkResult): string {
  if (last.listens < first.listens) {
    return `You needed ${first.listens} listens on the first chunk of this passage and ${last.listens} on the last. That drop is the whole point — the ear is doing more of the work.`;
  }
  if (last.listens > first.listens) {
    return `The last chunk took ${last.listens} listens against ${first.listens} on the first. It got harder, and you stayed with it.`;
  }
  return `Steady at ${first.listens} listens a chunk right through the passage.`;
}
