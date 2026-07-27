"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Link2, Send, Sparkles } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type {
  ContentIdea,
  NewsLevel,
  Polish,
  RespondSession,
  SourceRef,
  ThinkQuestion,
  ThinkTurn,
} from "@/types";
import {
  enrichPhrase,
  judgeContentIdeas,
  loadSource,
  polishPiece,
  sharpenThinking,
  thinkLadder,
} from "@/lib/client/clientApi";
import {
  DRAFT_MIN_WORDS,
  DRAFT_TARGET_WORDS,
  RUNG_ORDER,
  THINK_RUNGS,
  checkBorrowing,
  ideaText,
  localQuestions,
} from "@/lib/shared/respond";
import { countWords } from "@/lib/shared/stats";
import { prettyDay, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { SelectionCapture } from "@/components/SelectionCapture";

/**
 * Respond (docs/RESPOND.md) — the mode where the learner brings the English.
 *
 * They hand over something they were already reading; the app hands back only
 * QUESTIONS. Nothing here ever supplies a summary, an opinion, or an angle,
 * because a learner who leaves with the model's thinking has produced nothing.
 *
 *   READ    the source, with highlight-to-save into the Phrasebook.
 *   THINK   four questions climbing grasp → assume → push → extend (Bloom),
 *           each answered by them; "Push me" buys one harder follow-up.
 *   ANGLES  their four answers laid out as raw material, and three idea slots
 *           they fill themselves. Each is checked for BORROWING — the
 *           documented failure of source-based writing is restating the source
 *           in new words, so that's the one thing we test for.
 *   DRAFT   one idea becomes a short piece, their outline visible but inert.
 *   POLISH  what landed, at most two upgrades, phrases worth keeping.
 *
 * Undrafted angles stay in an idea bank on the home screen — reading produces
 * more ideas than anyone has time to write, and losing them is the waste.
 */

/** How many idea slots a session offers. Three is enough to force range. */
const IDEA_SLOTS = 3;

type View = "home" | "think" | "ideas" | "draft" | "done";
type InputMode = "paste" | "link";

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyIdea(): ContentIdea {
  return { id: makeId(), hook: "", bullets: ["", "", ""] };
}

/** The source, readable and highlightable — the same capture affordance the
 *  News Chat manuscript has, so a good phrase never gets away. */
function SourcePane({
  source,
  text,
  open,
  onToggle,
  onCapture,
}: {
  source: SourceRef;
  text: string;
  open: boolean;
  onToggle: () => void;
  onCapture: (text: string, context: string) => Promise<void>;
}) {
  return (
    <div className="border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <div className="min-w-0">
          <div className="truncate font-serif text-[15px] font-medium text-foreground">
            {source.title}
          </div>
          <div className="mt-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {source.site ? `${source.site} · ` : ""}
            {source.words} words
          </div>
        </div>
        <span className="flex-none font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {open ? "hide" : "read"}
        </span>
      </button>
      {open && (
        <SelectionCapture onCapture={onCapture}>
          <div
            data-capture-context
            className="max-h-[420px] overflow-y-auto border-t border-border px-4 py-3"
          >
            {text.split("\n").filter(Boolean).map((para, i) => (
              <p
                key={i}
                data-capture-context
                className="mb-2.5 font-serif text-[15px] leading-relaxed text-foreground/90"
              >
                {para}
              </p>
            ))}
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[10px] uppercase tracking-wide text-brand hover:underline"
              >
                Read the original ↗
              </a>
            )}
          </div>
        </SelectionCapture>
      )}
    </div>
  );
}

export function Respond() {
  const { store, saveRespondSession, removeRespondSession, collectPhrase } = useStore();
  const level: NewsLevel = store.newsLevel;

  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Source intake.
  const [mode, setMode] = useState<InputMode>("paste");
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState("");

  // The live session.
  const [sessionId, setSessionId] = useState("");
  const [source, setSource] = useState<SourceRef | null>(null);
  const [text, setText] = useState("");
  const [sourceOpen, setSourceOpen] = useState(true);
  const [turns, setTurns] = useState<ThinkTurn[]>([]);
  const [turnIdx, setTurnIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [followUp, setFollowUp] = useState<string>("");
  const [followAnswer, setFollowAnswer] = useState("");
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [checked, setChecked] = useState(false);
  const [chosenId, setChosenId] = useState("");
  const [draft, setDraft] = useState("");
  const [polish, setPolish] = useState<Polish | null>(null);
  const createdAt = useRef(0);

  // The idea bank: angles they wrote and haven't drafted. Reading generates
  // more ideas than anyone has time to write; the waste is losing them.
  const bank = useMemo(
    () =>
      store.respondSessions.flatMap((s) =>
        s.ideas
          .filter((i) => !i.drafted && i.hook.trim())
          .map((i) => ({ idea: i, session: s })),
      ),
    [store.respondSessions],
  );

  /** Persist whatever the session currently is — called at every transition. */
  const persist = useCallback(
    (patch: Partial<RespondSession> = {}) => {
      if (!source || !sessionId) return;
      saveRespondSession({
        id: sessionId,
        day: todayKey(),
        createdAt: createdAt.current || Date.now(),
        updatedAt: Date.now(),
        source,
        text,
        turns,
        ideas,
        chosenId: chosenId || undefined,
        draft,
        status: "thinking",
        ...patch,
      });
    },
    [source, sessionId, text, turns, ideas, chosenId, draft, saveRespondSession],
  );

  const capture = useCallback(
    async (snippet: string, context: string) => {
      const day = todayKey();
      const id = `rs-${snippet.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
      const captured = { module: "Respond", context, day };
      try {
        const e = await enrichPhrase(level, snippet, context);
        collectPhrase({
          id,
          text: e.text,
          meaning: e.meaning,
          example: e.example,
          register: e.register,
          alternatives: e.alternatives,
          kind: e.kind,
          collocations: e.collocations,
          captured,
        });
      } catch {
        // Enrichment is best-effort; capture never fails.
        collectPhrase({ id, text: snippet, meaning: "", example: snippet, captured });
      }
    },
    [level, collectPhrase],
  );

  // ---- start ----------------------------------------------------------------

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const loaded = await loadSource(mode === "link" ? { url } : { text: paste });
      const id = makeId();
      createdAt.current = Date.now();

      // The ladder is the point, so a failed questions call degrades to the
      // generic rungs rather than blocking the session.
      let questions: ThinkQuestion[];
      try {
        questions = await thinkLadder(level, loaded.source, loaded.text);
      } catch {
        questions = [];
      }
      if (questions.length === 0) questions = localQuestions();

      setSessionId(id);
      setSource(loaded.source);
      setText(loaded.text);
      setTurns(questions.map((q) => ({ ...q, answer: "" })));
      setTurnIdx(0);
      setAnswer("");
      setFollowUp("");
      setFollowAnswer("");
      setIdeas(Array.from({ length: IDEA_SLOTS }, emptyIdea));
      setChecked(false);
      setChosenId("");
      setDraft("");
      setPolish(null);
      setSourceOpen(true);
      setView("think");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+\s*/, "") : "That didn't load.");
    } finally {
      setBusy(false);
    }
  }

  /** Reopen a saved session straight into drafting one of its bank ideas. */
  function draftFromBank(session: RespondSession, idea: ContentIdea) {
    createdAt.current = session.createdAt;
    setSessionId(session.id);
    setSource(session.source);
    setText(session.text);
    setTurns(session.turns);
    setIdeas(session.ideas);
    setChecked(true);
    setChosenId(idea.id);
    setDraft("");
    setPolish(null);
    setSourceOpen(false);
    setView("draft");
  }

  // ---- think ----------------------------------------------------------------

  async function pushMe() {
    const turn = turns[turnIdx];
    if (!turn || busy || !answer.trim()) return;
    setBusy(true);
    try {
      setFollowUp(await sharpenThinking(level, turn.question, answer));
    } catch {
      setFollowUp("What makes you say that — what happened that taught you it?");
    } finally {
      setBusy(false);
    }
  }

  function nextTurn() {
    const next = turns.map((t, i) =>
      i === turnIdx
        ? {
            ...t,
            answer: answer.trim(),
            ...(followUp && followAnswer.trim()
              ? { followUp: { question: followUp, answer: followAnswer.trim() } }
              : {}),
          }
        : t,
    );
    setTurns(next);
    setAnswer("");
    setFollowUp("");
    setFollowAnswer("");

    if (turnIdx + 1 >= next.length) {
      persist({ turns: next, status: "ideas" });
      setView("ideas");
      return;
    }
    setTurnIdx((i) => i + 1);
    persist({ turns: next });
  }

  // ---- ideas ----------------------------------------------------------------

  function setIdea(id: string, patch: Partial<ContentIdea>) {
    setIdeas((xs) => xs.map((i) => (i.id === id ? { ...i, ...patch, own: undefined, note: undefined } : i)));
    setChecked(false);
  }

  async function checkAngles() {
    const filled = ideas.filter((i) => i.hook.trim());
    if (filled.length === 0 || busy) return;
    setBusy(true);
    try {
      const verdicts = await judgeContentIdeas(
        level,
        source!,
        text,
        filled.map((i) => ({ id: i.id, hook: i.hook, bullets: i.bullets.filter(Boolean) })),
      );
      const byId = new Map(verdicts.map((v) => [v.id, v]));
      const next = ideas.map((i) => ({ ...i, ...(byId.get(i.id) ?? {}) }));
      setIdeas(next);
      setChecked(true);
      persist({ ideas: next, status: "ideas" });
    } catch {
      // Offline: the borrowing check is local anyway, so still give a verdict.
      const next = ideas.map((i) => {
        if (!i.hook.trim()) return i;
        const c = checkBorrowing(text, ideaText(i));
        return {
          ...i,
          own: c.own,
          note: c.own
            ? "In your own words — that's the part that matters."
            : "This is still the article's wording. What do YOU know about it that they don't?",
          ...(c.longest && !c.own ? { borrowed: c.longest } : {}),
        };
      });
      setIdeas(next);
      setChecked(true);
      persist({ ideas: next, status: "ideas" });
    } finally {
      setBusy(false);
    }
  }

  function toDraft(id: string) {
    setChosenId(id);
    setDraft("");
    setPolish(null);
    setSourceOpen(false);
    persist({ chosenId: id, status: "drafting" });
    setView("draft");
  }

  // ---- draft ----------------------------------------------------------------

  async function finishDraft() {
    if (busy || countWords(draft) < DRAFT_MIN_WORDS) return;
    setBusy(true);
    const chosen = ideas.find((i) => i.id === chosenId);
    try {
      const p = await polishPiece(level, source!, chosen?.hook ?? "", draft);
      setPolish(p);
      const next = ideas.map((i) => (i.id === chosenId ? { ...i, drafted: true } : i));
      setIdeas(next);
      persist({ ideas: next, draft, polish: p, status: "done" });
      setView("done");
    } finally {
      setBusy(false);
    }
  }

  function keepPhrase(text: string, meaning: string) {
    collectPhrase({
      id: `rs-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`,
      text,
      meaning,
      example: text,
      captured: { module: "Respond", context: draft.slice(0, 200), day: todayKey() },
    });
  }

  // ---- think view -----------------------------------------------------------

  if (view === "think" && source) {
    const turn = turns[turnIdx];
    const meta = THINK_RUNGS[turn.rung];
    return (
      <PageContainer width="default">
        <button
          type="button"
          onClick={() => setView("home")}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Respond
        </button>

        <div className="mt-4">
          <SourcePane
            source={source}
            text={text}
            open={sourceOpen}
            onToggle={() => setSourceOpen((o) => !o)}
            onCapture={capture}
          />
        </div>

        <div className="mt-5 flex items-center gap-1.5">
          {RUNG_ORDER.map((r, i) => (
            <span
              key={r}
              title={THINK_RUNGS[r].label}
              className={cn(
                "h-1 flex-1",
                i < turnIdx ? "bg-brand" : i === turnIdx ? "bg-gold" : "bg-border",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="kicker">
            {meta.label} · {turnIdx + 1} of {turns.length}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            you think · we only ask
          </span>
        </div>

        <p className="mt-3 text-pretty font-serif text-[21px] leading-snug text-foreground">
          {turn.question}
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">{meta.why}</p>

        <div className="mt-4 bg-oxford-tint px-3 py-2">
          <textarea
            autoFocus
            rows={4}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="In your own words…"
            className="w-full resize-none bg-transparent font-serif text-[16px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
          />
        </div>

        {followUp && (
          <div className="mt-3 border-l-2 border-gold pl-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold">
              And under that
            </div>
            <p className="mt-1 font-serif text-[17px] leading-snug text-foreground">{followUp}</p>
            <div className="mt-2 bg-ochre-tint px-3 py-2">
              <textarea
                rows={3}
                value={followAnswer}
                onChange={(e) => setFollowAnswer(e.target.value)}
                placeholder="Keep going…"
                className="w-full resize-none bg-transparent font-serif text-[15.5px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void pushMe()}
            disabled={!answer.trim() || busy || !!followUp}
            title="One harder question about what you just wrote"
          >
            <Sparkles /> {busy ? "Thinking…" : "Push me"}
          </Button>
          <Button onClick={nextTurn} disabled={!answer.trim()}>
            {turnIdx + 1 >= turns.length ? "Now your angles" : "Next question"} <ArrowRight />
          </Button>
        </div>
      </PageContainer>
    );
  }

  // ---- ideas view -----------------------------------------------------------

  if (view === "ideas" && source) {
    const filled = ideas.filter((i) => i.hook.trim()).length;
    const own = ideas.filter((i) => i.own).length;
    return (
      <PageContainer width="wide" className="max-w-[1060px]">
        <button
          type="button"
          onClick={() => setView("home")}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Respond
        </button>

        <div className="mt-4">
          <div className="kicker">Your angles</div>
          <h1 className="mt-1.5 text-[28px] tracking-tight">
            Three things you could write about this
          </h1>
          <p className="mt-1.5 max-w-[620px] text-pretty text-[14.5px] text-muted-foreground">
            Not what the piece said — what <em>you</em> now have to say. Your own
            answers are below; the angles come out of those, not out of the
            article.
          </p>
        </div>

        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
          {/* Their own thinking, as raw material. The only "suggestions" this
              screen ever shows are the learner's own words. */}
          <aside className="lg:sticky lg:top-8">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              What you said
            </div>
            <div className="mt-2.5 flex flex-col gap-3">
              {turns
                .filter((t) => t.answer)
                .map((t) => (
                  <div key={t.rung} className="border-l-2 border-oxford-line pl-3">
                    <div className="font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                      {THINK_RUNGS[t.rung].label}
                    </div>
                    <p className="mt-0.5 font-serif text-[13.5px] italic leading-snug text-foreground/90">
                      “{t.answer}”
                    </p>
                    {t.followUp && (
                      <p className="mt-1 font-serif text-[13px] italic leading-snug text-muted-foreground">
                        “{t.followUp.answer}”
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-col gap-4">
              {ideas.map((idea, n) => (
                <div
                  key={idea.id}
                  className={cn(
                    "border bg-card p-4",
                    idea.own === true
                      ? "border-brand"
                      : idea.own === false
                        ? "border-ochre-line"
                        : "border-border",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Idea {n + 1}
                    </span>
                    {idea.own !== undefined && (
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-wide",
                          idea.own ? "text-brand-ink" : "text-gold",
                        )}
                      >
                        {idea.own ? "✓ yours" : "still the article's"}
                      </span>
                    )}
                  </div>

                  <input
                    value={idea.hook}
                    onChange={(e) => setIdea(idea.id, { hook: e.target.value })}
                    placeholder="Your hook — the line that makes someone read on…"
                    className="mt-2 w-full border-b border-input bg-transparent py-1.5 font-serif text-[17px] text-foreground outline-none transition-colors focus:border-brand placeholder:text-[15px] placeholder:italic placeholder:text-muted-foreground/60"
                  />

                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {idea.bullets.map((b, bi) => (
                      <div key={bi} className="flex items-baseline gap-2">
                        <span className="flex-none text-muted-foreground">·</span>
                        <input
                          value={b}
                          onChange={(e) =>
                            setIdea(idea.id, {
                              bullets: idea.bullets.map((x, xi) =>
                                xi === bi ? e.target.value : x,
                              ),
                            })
                          }
                          placeholder={
                            bi === 0 ? "the point you'd make first…" : "then…"
                          }
                          className="min-w-0 flex-1 bg-transparent py-0.5 text-[14px] text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/60"
                        />
                      </div>
                    ))}
                  </div>

                  {idea.note && (
                    <div
                      className={cn(
                        "mt-3 border-t pt-2.5 text-[13px]",
                        idea.own ? "border-border text-brand-ink" : "border-ochre-line text-gold",
                      )}
                    >
                      {idea.note}
                      {idea.borrowed && (
                        <div className="mt-1 font-serif italic opacity-80">
                          Lifted from the article: “{idea.borrowed}”
                        </div>
                      )}
                    </div>
                  )}

                  {checked && idea.hook.trim() && (
                    <Button
                      size="sm"
                      variant={idea.own ? "default" : "outline"}
                      className="mt-3"
                      onClick={() => toDraft(idea.id)}
                    >
                      Write this one <ArrowRight />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">
                {checked
                  ? `${own} of ${filled} ${own === 1 ? "angle is" : "angles are"} yours. The ones you don't write today wait in your idea bank.`
                  : "Write at least one, then check whether it's actually yours."}
              </p>
              <Button onClick={() => void checkAngles()} disabled={filled === 0 || busy}>
                {busy ? "Reading…" : checked ? "Check again" : "Check my angles"}
              </Button>
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  // ---- draft view -----------------------------------------------------------

  if (view === "draft" && source) {
    const chosen = ideas.find((i) => i.id === chosenId);
    const words = countWords(draft);
    const pct = Math.min(100, Math.round((words / DRAFT_TARGET_WORDS) * 100));
    return (
      <PageContainer width="default">
        <button
          type="button"
          onClick={() => setView("ideas")}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Your angles
        </button>

        <div className="mt-4">
          <div className="kicker">Write it</div>
          <h1 className="mt-1.5 text-pretty font-serif text-[24px] leading-snug tracking-tight">
            {chosen?.hook || "Your piece"}
          </h1>
        </div>

        {/* The outline is reference, not insertable text — same stance as every
            other mode: nothing here completes the learner's turn. */}
        {chosen && chosen.bullets.some(Boolean) && (
          <div className="mt-3 select-none border-l-2 border-oxford-line pl-3.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Your spine
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {chosen.bullets.filter(Boolean).map((b, i) => (
                <li key={i} className="text-[13.5px] text-muted-foreground">
                  · {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <SourcePane
            source={source}
            text={text}
            open={sourceOpen}
            onToggle={() => setSourceOpen((o) => !o)}
            onCapture={capture}
          />
        </div>

        <div className="mt-4 bg-oxford-tint px-4 py-3">
          <textarea
            autoFocus
            rows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write your piece. Don't stop to fix things — that comes after."
            spellCheck={false}
            className="w-full resize-none bg-transparent font-serif text-[16.5px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
          />
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="h-1 flex-1 bg-border">
            <div className="h-1 bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <span className="flex-none font-mono text-[11px] tabular-nums text-muted-foreground">
            {words}/{DRAFT_TARGET_WORDS}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <Button
            onClick={() => void finishDraft()}
            disabled={words < DRAFT_MIN_WORDS || busy}
            title={
              words < DRAFT_MIN_WORDS
                ? `A few more lines — ${DRAFT_MIN_WORDS} words minimum`
                : undefined
            }
          >
            <Send /> {busy ? "Reading it…" : "I'm done"}
          </Button>
        </div>
      </PageContainer>
    );
  }

  // ---- done view ------------------------------------------------------------

  if (view === "done" && source && polish) {
    const chosen = ideas.find((i) => i.id === chosenId);
    const left = ideas.filter((i) => !i.drafted && i.hook.trim()).length;
    return (
      <PageContainer width="default">
        <button
          type="button"
          onClick={() => setView("home")}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Respond
        </button>

        <div className="mt-5 bg-card p-6 sm:px-12 sm:py-10">
          <div className="kicker">Your piece</div>
          <h2 className="mt-2.5 text-pretty text-[24px] leading-snug">{chosen?.hook}</h2>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {countWords(draft)} words · after {source.title.slice(0, 60)}
            {source.title.length > 60 ? "…" : ""}
          </p>

          <p className="mt-4 whitespace-pre-line border-l-2 border-oxford-line pl-4 font-serif text-[16px] leading-relaxed text-foreground">
            {draft}
          </p>

          <div className="mt-6 border-t border-input pt-5">
            <p className="text-pretty font-serif text-[17px] leading-snug text-brand-ink">
              {polish.celebration}
            </p>

            {polish.landed.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {polish.landed.map((l, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[14px] text-foreground/90">
                    <span className="flex-none text-brand">✓</span>
                    {l}
                  </li>
                ))}
              </ul>
            )}

            {polish.upgrades.length > 0 && (
              <div className="mt-4 border border-ochre-line bg-ochre-tint p-3.5 text-[14px] text-gold">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em]">
                  Two ideas to play with
                </div>
                {polish.upgrades.map((u, i) => (
                  <div key={i} className="mt-2">
                    <span className="opacity-70">You wrote:</span> “{u.you}”
                    <br />
                    <span className="opacity-70">Try:</span> <b>“{u.upgrade}”</b>
                    {u.why && <span className="opacity-70"> — {u.why}</span>}
                  </div>
                ))}
              </div>
            )}

            {polish.keep.length > 0 && (
              <div className="mt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Worth keeping — your own phrases
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {polish.keep.map((k) => (
                    <button
                      key={k.text}
                      type="button"
                      onClick={() => keepPhrase(k.text, k.meaning)}
                      title={`Save “${k.text}” to your Phrasebook`}
                      className="border border-input bg-card px-2.5 py-1 text-[13px] text-foreground transition-colors hover:border-brand hover:bg-brand-muted"
                    >
                      {k.text} <span className="text-muted-foreground">+</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-input pt-5">
            <p className="text-pretty text-[13.5px] text-muted-foreground">
              {left > 0
                ? `${left} more ${left === 1 ? "angle is" : "angles are"} waiting in your idea bank.`
                : "Bring something else you've been reading whenever you like."}
            </p>
            <Button className="flex-none" onClick={() => setView("home")}>
              Back to Respond
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // ---- home -----------------------------------------------------------------

  return (
    <PageContainer width="wide" className="max-w-[1060px]">
      <div>
        <div className="kicker">Learn · Respond</div>
        <h1 className="mt-1.5 text-[30px] tracking-tight">
          Read something. Then say something back.
        </h1>
        <p className="mt-1.5 max-w-[600px] text-pretty text-[15px] text-muted-foreground">
          Bring anything you were already reading in English. You&apos;ll get
          questions — never answers — until you have an angle of your own, and
          then you write it.
        </p>
      </div>

      <div className="mt-7 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="min-w-0">
          <div className="flex gap-4 border-b border-input pb-2.5">
            {(["paste", "link"] as InputMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={cn(
                  "border-b-2 pb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors",
                  mode === m
                    ? "border-brand text-brand-ink"
                    : "border-transparent text-muted-foreground hover:text-brand-ink",
                )}
              >
                {m === "paste" ? "Paste the text" : "Give a link"}
              </button>
            ))}
          </div>

          {mode === "paste" ? (
            <div className="mt-3 bg-oxford-tint px-4 py-3">
              <textarea
                rows={12}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Paste an article, a LinkedIn post, a newsletter, a Reddit thread — anything you've been reading in English."
                className="w-full resize-none bg-transparent font-serif text-[15.5px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
              />
            </div>
          ) : (
            <div className="mt-3">
              <div className="flex items-center gap-2 border-b-2 border-input py-2 focus-within:border-brand">
                <Link2 className="size-4 flex-none text-muted-foreground" />
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void start();
                    }
                  }}
                  placeholder="https://…"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">
                We fetch the page and pull the text out. Paywalls and
                script-heavy sites will refuse — paste the text when that
                happens, it always works.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 border-l-2 border-ochre-line bg-ochre-tint px-3 py-2 text-[13.5px] text-gold">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
              4 questions · 3 angles · 1 piece
            </p>
            <Button
              size="lg"
              onClick={() => void start()}
              disabled={busy || (mode === "paste" ? paste.trim().length < 200 : !url.trim())}
            >
              {busy ? "Reading it…" : "Start thinking"}
            </Button>
          </div>

          {store.respondSessions.length > 0 && (
            <div className="mt-10">
              <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Things you&apos;ve responded to
              </div>
              <div className="mt-2 flex flex-col">
                {store.respondSessions.slice(0, 6).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-baseline gap-3 border-b border-border py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-[15px] text-foreground">
                        {s.source.title}
                      </div>
                      <div className="mt-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {prettyDay(s.day)} · {s.ideas.filter((i) => i.hook.trim()).length} angles ·{" "}
                        {s.ideas.filter((i) => i.drafted).length} written
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRespondSession(s.id)}
                      className="flex-none font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60 transition-colors hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-8">
          <div className="bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">
              Your idea bank
            </div>
            {bank.length === 0 ? (
              <p className="mt-2.5 text-pretty font-serif text-[15px] italic leading-snug text-muted-foreground">
                Angles you don&apos;t write today land here. Reading always
                produces more ideas than there's time to write — this is where
                they wait.
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-3">
                  {bank.slice(0, 6).map(({ idea, session }) => (
                    <button
                      key={idea.id}
                      type="button"
                      onClick={() => draftFromBank(session, idea)}
                      className="border-l-2 border-ochre-line pl-3 text-left transition-colors hover:border-brand"
                    >
                      <div className="font-serif text-[14.5px] leading-snug text-foreground">
                        {idea.hook}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                        after {session.source.title}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-3.5 text-[12.5px] text-muted-foreground">
                  Tap one to write it — the source comes back with it.
                </p>
              </>
            )}
          </div>

          <div className="bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              How this works
            </div>
            <ol className="mt-3 flex flex-col gap-2.5">
              {RUNG_ORDER.map((r, i) => (
                <li key={r} className="flex items-baseline gap-2.5">
                  <span className="flex-none font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <span className="text-[13.5px] font-medium text-foreground">
                      {THINK_RUNGS[r].label}
                    </span>
                    <p className="text-[12.5px] leading-snug text-muted-foreground">
                      {THINK_RUNGS[r].why}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-3.5 border-t border-border pt-3 text-pretty text-[12.5px] text-muted-foreground">
              Anything you highlight while reading goes to your{" "}
              <Link href="/phrasebook" className="border-b border-input text-brand hover:border-brand">
                Phrasebook
              </Link>
              .
            </p>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
