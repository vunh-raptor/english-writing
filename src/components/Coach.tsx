import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store/StoreContext";
import type { ChatMessage, CoachTurn } from "../types";
import { todaysPhrases } from "../lib/phrases";
import { coachTurn } from "../lib/clientApi";

/**
 * The conversational Phrase Coach. It chats with the learner and keeps going
 * until they've *produced* each of today's phrases themselves — the chips up top
 * light up only when a phrase is used correctly and unprompted.
 */
export function Coach() {
  const { store, recordMasteredPhrases } = useStore();
  // Fixed for the session so it doesn't reshuffle as phrases get mastered.
  const [phrases] = useState(() => todaysPhrases(store.masteredPhrases));

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [needsAI, setNeedsAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startedRef = useRef(false);
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
      const producedIds = turn.progress.filter((p) => p.produced).map((p) => p.id);
      if (producedIds.length) recordMasteredPhrases(producedIds);
      if (turn.done) setDone(true);
    },
    [recordMasteredPhrases],
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
      <div className="screen screen-pad">
        <div className="container center-narrow">
          <h1 style={{ fontSize: 26 }}>💬 Phrase Coach</h1>
          <div className="status-note warn" style={{ marginTop: 14 }}>
            This mode chats with you using AI, so it needs a server AI key
            (free-tier Groq or Gemini works). Set one in the environment and
            it'll come alive. Here are today's phrases to preview:
          </div>
          {phrases.map((p) => (
            <div className="card" key={p.id} style={{ marginTop: 12 }}>
              <div className="phrase-preview-text">{p.text}</div>
              <div className="muted" style={{ marginTop: 4 }}>{p.meaning}</div>
              <div className="fb-example" style={{ marginTop: 8 }}>{p.example}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="coach-screen">
      <div className="container coach-wrap">
        <div className="coach-head">
          <h1 style={{ fontSize: 22 }}>💬 Phrase Coach</h1>
          <p className="muted" style={{ margin: "2px 0 0" }}>
            Chat until you can use today's phrases yourself.
          </p>
          <div className="phrase-chips">
            {phrases.map((p) => (
              <span key={p.id} className={`phrase-chip${progress[p.id] ? " done" : ""}`} title={p.meaning}>
                {progress[p.id] ? "✓ " : ""}
                {p.text}
              </span>
            ))}
          </div>
          <div className="faint coach-count">
            {producedCount} / {phrases.length} produced on your own
          </div>
        </div>

        <div className="chat">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="msg coach typing">
              <span />
              <span />
              <span />
            </div>
          )}
          {done && (
            <div className="coach-done">
              🎉 You used all of today's phrases yourself — that's how they
              actually stick. Come back tomorrow for more.
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="status-note warn" style={{ margin: "0 0 8px" }}>
            {error}
          </div>
        )}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={done ? "Lesson complete 🎉" : "Type your reply…"}
            disabled={loading || done}
            autoComplete="off"
          />
          <button className="btn btn-primary" type="submit" disabled={loading || done || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
