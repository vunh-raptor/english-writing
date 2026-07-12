"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/StoreContext";
import type {
  ChatMessage,
  NewsSubject,
  DirectorState,
  ConverseTurn,
  AssistHelp,
  Recap,
} from "@/types";
import {
  fetchNewsSubject,
  converse,
  converseAssist,
  converseRecap,
} from "@/lib/client/clientApi";

/**
 * News Chat — a fully online mode: today's real news → one curated subject → a
 * conversation whose only job is to keep the learner *producing* English about
 * it. The one metric is how many words they write, shown live as a momentum
 * meter. When they pause, tappable "ways to continue" lower the cost of the next
 * sentence. At the end, a warm recap mines phrases into the Phrase Coach's SRS.
 */

const INITIAL_STATE: DirectorState = {
  level: "B1",
  facetsCovered: [],
  wordsProduced: 0,
  turn: 0,
  stalls: 0,
};

/** Word target that earns the warm wrap (the coach can also wrap earlier). */
const WORD_TARGET = 120;
/** How long the learner must sit paused (focused, non-empty question) before help. */
const STALL_MS = 7000;

export function NewsChat() {
  const { saveMinedPhrases } = useStore();

  const [subject, setSubject] = useState<NewsSubject | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<DirectorState>(INITIAL_STATE);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [needsAI, setNeedsAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stall assist.
  const [assist, setAssist] = useState<AssistHelp | null>(null);
  const [assisting, setAssisting] = useState(false);

  // Wrap / recap.
  const [recap, setRecap] = useState<Recap | null>(null);
  const [wrapping, setWrapping] = useState(false);
  const [done, setDone] = useState(false);

  const startedRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The coach's current question, so stall help knows what they're stuck on.
  const currentDemand = messages.length
    ? messages[messages.length - 1].content
    : subject?.hook ?? "";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, recap]);

  // Load the curated subject, then open the conversation.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const subj = await fetchNewsSubject();
        setSubject(subj);
        const turn = await converse(subj, INITIAL_STATE, []);
        applyTurn(turn);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (/503/.test(msg)) setNeedsAI(true);
        else if (/502/.test(msg)) setError("Couldn't reach today's news — try again.");
        else setError("Couldn't start the chat — try refreshing.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTurn = useCallback((turn: ConverseTurn) => {
    setMessages((m) => [...m, { role: "coach", content: turn.reply }]);
    setState(turn.state);
    if (turn.shouldWrap) setDone(true);
  }, []);

  const clearStall = useCallback(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = null;
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading || wrapping) return;
    clearStall();
    setAssist(null);
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setLoading(true);
    setError(null);
    if (!subject) return;
    try {
      const turn = await converse(subject, state, history);
      applyTurn(turn);
    } catch {
      setError("That message didn't go through — try again.");
    } finally {
      setLoading(false);
    }
  }

  // Fire stall help when the learner sits paused with the input focused.
  function armStall() {
    clearStall();
    if (loading || wrapping || done || !subject) return;
    stallTimer.current = setTimeout(async () => {
      setAssisting(true);
      try {
        const help = await converseAssist(subject.subject, currentDemand, input);
        setAssist(help);
        setState((s) => ({ ...s, stalls: s.stalls + 1 }));
      } catch {
        /* stall help is a nicety; never surface an error */
      } finally {
        setAssisting(false);
      }
    }, STALL_MS);
  }

  function insertStarter(starter: string) {
    setInput((prev) => {
      const sep = prev && !prev.endsWith(" ") ? " " : "";
      return `${prev}${sep}${starter} `;
    });
    setAssist(null);
    clearStall();
  }

  async function wrapUp() {
    if (!subject || wrapping) return;
    clearStall();
    setWrapping(true);
    setError(null);
    try {
      const r = await converseRecap(subject.subject, messages);
      setRecap(r);
      setDone(true);
      // Feed the mined phrases into the Phrase Coach's practice pool (they become
      // "new" phrases there, due immediately, and then get spaced like the rest).
      if (r.phrasesToTry.length) {
        saveMinedPhrases(
          r.phrasesToTry.map((p) => ({
            id: `nc-${p.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
            text: p.text,
            meaning: p.meaning,
            example: p.text,
            register: "from your News Chat",
          })),
        );
      }
    } catch {
      setError("Couldn't build your recap — but your words still count. 🎉");
    } finally {
      setWrapping(false);
    }
  }

  const reachedTarget = state.wordsProduced >= WORD_TARGET;
  const meterPct = Math.min(100, Math.round((state.wordsProduced / WORD_TARGET) * 100));

  if (needsAI) {
    return (
      <div className="screen screen-pad">
        <div className="container center-narrow">
          <h1 style={{ fontSize: 26 }}>📰 News Chat</h1>
          <div className="status-note warn" style={{ marginTop: 14 }}>
            News Chat is a fully online mode: it curates a real topic from today's
            news and chats with you about it using AI. It needs a server AI key
            (free-tier Groq or Gemini works) and network access. Set one and it'll
            come alive.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-screen">
      <div className="container coach-wrap">
        <div className="coach-head">
          <h1 style={{ fontSize: 22 }}>📰 News Chat</h1>
          {subject ? (
            <div className="news-subject">
              <div className="news-subject-text">{subject.subject}</div>
              <div className="news-subject-src">
                from {subject.url ? (
                  <a href={subject.url} target="_blank" rel="noreferrer">
                    {subject.source} ↗
                  </a>
                ) : (
                  subject.source
                )}
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: "2px 0 0" }}>
              Finding today's talk of the day…
            </p>
          )}

          <div className="momentum">
            <div className="momentum-bar">
              <div className="momentum-fill" style={{ width: `${meterPct}%` }} />
            </div>
            <span className="momentum-label">
              {state.wordsProduced} {state.wordsProduced === 1 ? "word" : "words"} written
              {reachedTarget ? " — nice momentum! 🎉" : ""}
            </span>
          </div>
        </div>

        <div className="chat">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.content}
            </div>
          ))}
          {(loading || assisting) && (
            <div className="msg coach typing">
              <span />
              <span />
              <span />
            </div>
          )}

          {assist && !done && (
            <div className="assist">
              <div className="assist-q">{assist.simplerQuestion}</div>
              <div className="assist-opts">
                {assist.options.map((o, i) => (
                  <button key={i} className="assist-chip" onClick={() => insertStarter(o.starter)}>
                    <span className="assist-angle">{o.angle}</span>
                    {o.starter}…
                  </button>
                ))}
              </div>
            </div>
          )}

          {recap && (
            <div className="recap">
              <div className="recap-celebrate">🎉 {recap.celebration}</div>
              {recap.didWell.length > 0 && (
                <ul className="recap-wins">
                  {recap.didWell.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {recap.phrasesToTry.length > 0 && (
                <div className="recap-phrases">
                  <div className="eyebrow">Phrases to try</div>
                  {recap.phrasesToTry.map((p, i) => (
                    <div className="recap-phrase" key={i}>
                      <b>{p.text}</b> <span className="muted">— {p.meaning}</span>
                    </div>
                  ))}
                  <div className="faint" style={{ marginTop: 6, fontSize: 12.5 }}>
                    Saved to your Phrase Coach to practice later.
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="status-note warn" style={{ margin: "0 0 8px" }}>
            {error}
          </div>
        )}

        {!done && (reachedTarget || messages.length >= 4) && subject && (
          <button className="wrap-btn" onClick={wrapUp} disabled={wrapping}>
            {wrapping ? "Wrapping up…" : "Wrap up & see my recap →"}
          </button>
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
            onChange={(e) => {
              setInput(e.target.value);
              armStall();
            }}
            onFocus={armStall}
            onBlur={clearStall}
            placeholder={done ? "Great session 🎉" : "Write your reply…"}
            disabled={loading || wrapping || done || !subject}
            autoComplete="off"
          />
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || wrapping || done || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
