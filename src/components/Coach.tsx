import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { ChatMessage, CoachTurn } from "@/types";
import { todaysPhrases } from "@/lib/shared/phrases";
import { coachTurn } from "@/lib/client/clientApi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/page-container";

/**
 * The conversational Phrase Coach. It chats with the learner and keeps going
 * until they've *produced* each of today's phrases themselves — the chips up top
 * light up only when a phrase is used correctly and unprompted.
 */
export function Coach() {
  const { store, reviewPhrases } = useStore();
  // Fixed for the session so it doesn't reshuffle mid-lesson.
  const [phrases] = useState(() => todaysPhrases(store.phraseSrs));

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [needsAI, setNeedsAI] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRef, setShowRef] = useState(false);

  const startedRef = useRef(false);
  const scheduledRef = useRef<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const applyTurn = useCallback(
    (turn: CoachTurn) => {
      setMessages((m) => [...m, { role: "coach", content: turn.reply }]);
      const map: Record<string, boolean> = {};
      for (const p of turn.progress) map[p.id] = p.produced;
      setProgress(map);
      // Schedule each phrase forward once, the first time it's produced.
      const newly = turn.progress
        .filter((p) => p.produced && !scheduledRef.current.has(p.id))
        .map((p) => p.id);
      if (newly.length) {
        newly.forEach((id) => scheduledRef.current.add(id));
        reviewPhrases(newly, true);
      }
      if (turn.done) setDone(true);
    },
    [reviewPhrases],
  );

  // Open the conversation.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const turn = await coachTurn(phrases, []);
        applyTurn(turn);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (/503/.test(msg)) setNeedsAI(true);
        else setError("Couldn't start the chat — try refreshing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [phrases, applyTurn]);

  async function send() {
    const text = input.trim();
    if (!text || loading || done) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const turn = await coachTurn(phrases, history);
      applyTurn(turn);
    } catch {
      setError("That message didn't go through — try again.");
    } finally {
      setLoading(false);
    }
  }

  const producedCount = phrases.filter((p) => progress[p.id]).length;

  if (needsAI) {
    return (
      <PageContainer width="narrow">
        <h1 className="text-2xl">💬 Phrase Coach</h1>
        <div className="note note-warning mt-3.5">
          This mode chats with you using AI, so it needs a server AI key
          (free-tier Groq or Gemini works). Set one in the environment and it&apos;ll
          come alive. Here are today&apos;s phrases to preview:
        </div>
        {phrases.map((p) => (
          <Card className="mt-3 p-5" key={p.id}>
            <div className="font-serif text-xl font-semibold">{p.text}</div>
            <div className="mt-1 text-muted-foreground">{p.meaning}</div>
            <div className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-sm text-muted-foreground">
              {p.example}
            </div>
            {p.alternatives && p.alternatives.length > 0 && (
              <div className="mt-2 text-sm text-sage">
                Similar ways: {p.alternatives.map((a) => a.text).join(" · ")}
              </div>
            )}
          </Card>
        ))}
      </PageContainer>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-5 sm:px-6">
        <div className="border-b border-border py-4">
          <h1 className="text-xl">💬 Phrase Coach</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Chat until you can use today&apos;s phrases yourself.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {phrases.map((p) => (
              <span
                key={p.id}
                title={p.meaning}
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px] transition-colors",
                  progress[p.id]
                    ? "border-sage bg-sage-muted font-semibold text-sage-ink"
                    : "border-input bg-muted text-muted-foreground",
                )}
              >
                {progress[p.id] ? "✓ " : ""}
                {p.text}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2.5">
            <span className="text-xs text-muted-foreground">
              {producedCount} / {phrases.length} produced on your own
            </span>
            <button
              className="text-xs font-medium text-brand hover:underline"
              onClick={() => setShowRef((v) => !v)}
            >
              {showRef ? "Hide" : "Show"} similar ways
            </button>
          </div>
          {showRef && (
            <div className="mt-2.5 flex max-h-[34vh] flex-col gap-2.5 overflow-y-auto rounded-md border border-border bg-muted p-3.5">
              {phrases.map((p) => (
                <div className="text-sm leading-snug" key={p.id}>
                  <b>{p.text}</b>{" "}
                  <span className="text-muted-foreground">— {p.meaning}</span>
                  {p.alternatives && p.alternatives.length > 0 && (
                    <div className="mt-0.5 text-[13px] text-sage">
                      Similar ways:{" "}
                      {p.alternatives.map((a) => a.text).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[80%] whitespace-pre-wrap px-3.5 py-2.5 text-[15px] leading-relaxed",
                m.role === "coach"
                  ? "self-start rounded-2xl rounded-bl-md border border-border bg-card text-card-foreground shadow-soft"
                  : "self-end rounded-2xl rounded-br-md bg-brand text-brand-foreground",
              )}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="flex max-w-[80%] items-center gap-1 self-start rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3 shadow-soft">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
              <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
            </div>
          )}
          {done && (
            <div className="mx-auto max-w-[90%] self-center rounded-2xl bg-sage-muted px-4 py-3 text-center text-[15px] text-sage-ink">
              🎉 You used all of today&apos;s phrases yourself — that&apos;s how they
              actually stick. Come back tomorrow for more.
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <div className="note note-warning mb-2">{error}</div>}

        <form
          className="flex gap-2.5 border-t border-border py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            className="flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={done ? "Lesson complete 🎉" : "Type your reply…"}
            disabled={loading || done}
            autoComplete="off"
          />
          <Button type="submit" disabled={loading || done || !input.trim()}>
            <Send />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
