import { useMemo } from "react";
import { useStore } from "../store/StoreContext";
import { summarize } from "../lib/stats";
import { srsSummary } from "../lib/srs";
import { SEED_PHRASES } from "../lib/phrases";
import { addDays, prettyDay, todayKey } from "../lib/date";
import type { DayKey } from "../types";

const CAL_DAYS = 84; // ~12 weeks

function levelFor(words: number): string {
  if (words <= 0) return "";
  if (words <= 50) return "lv1";
  if (words <= 150) return "lv2";
  return "lv3";
}

export function Progress() {
  const { store } = useStore();
  const { entries, vocab, profile, phraseSrs } = store;
  const today = todayKey();

  const phraseStats = useMemo(
    () => srsSummary(SEED_PHRASES.map((p) => p.id), phraseSrs, today),
    [phraseSrs, today],
  );

  const summary = useMemo(
    () => summarize(entries, vocab, today),
    [entries, vocab, today],
  );

  const wordsByDay = useMemo(() => {
    const m: Record<DayKey, number> = {};
    for (const e of entries) m[e.day] = (m[e.day] ?? 0) + e.words;
    return m;
  }, [entries]);

  const calendar = useMemo(() => {
    const start = addDays(today, -(CAL_DAYS - 1));
    return Array.from({ length: CAL_DAYS }, (_, i) => {
      const day = addDays(start, i);
      const words = wordsByDay[day] ?? 0;
      return { day, words };
    });
  }, [today, wordsByDay]);

  const sparkMax = Math.max(1, ...summary.recentLengths);

  if (entries.length === 0 && Object.keys(phraseSrs).length === 0) {
    return (
      <div className="screen screen-pad">
        <div className="container center-narrow">
          <h1 style={{ fontSize: 26 }}>Your progress</h1>
          <div className="card" style={{ marginTop: 18 }}>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              Nothing here yet — write your first session (or chat with the
              Coach) and this fills with real growth: words you've used, your
              vocabulary, phrases you can produce, and your streak.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen screen-pad">
      <div className="container">
        <h1 style={{ fontSize: 26 }}>Your progress</h1>

        <div className="section-title">
          <h2>Growth that's real</h2>
        </div>
        <div className="bigstat-grid">
          <div className="bigstat">
            <div className="n">{summary.vocabulary}</div>
            <div className="l">words in your vocabulary</div>
          </div>
          <div className="bigstat">
            <div className="n" style={{ color: "var(--accent)" }}>
              +{summary.newWordsThisWeek}
            </div>
            <div className="l">new words this week</div>
          </div>
          <div className="bigstat">
            <div className="n">{summary.totalWords.toLocaleString()}</div>
            <div className="l">words written, all time</div>
          </div>
          <div className="bigstat">
            <div className="n">{summary.avgSentenceLength}</div>
            <div className="l">avg words per sentence</div>
          </div>
        </div>

        <div className="section-title">
          <h2>Phrases</h2>
          <span className="faint">spaced practice · due today: {phraseStats.dueToday}</span>
        </div>
        <div className="bigstat-grid">
          <div className="bigstat">
            <div className="n">{phraseStats.mastered}</div>
            <div className="l">phrases mastered</div>
          </div>
          <div className="bigstat">
            <div className="n" style={{ color: "var(--accent)" }}>
              {phraseStats.learning}
            </div>
            <div className="l">learning now</div>
          </div>
        </div>

        <div className="section-title">
          <h2>Streak</h2>
          <span className="faint">
            longest: {profile.longestStreak} · freezes: {profile.freezes}
          </span>
        </div>
        <div className="card">
          <div style={{ display: "flex", gap: 22, alignItems: "baseline", marginBottom: 14 }}>
            <div>
              <span style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600 }}>
                {profile.streak}
              </span>{" "}
              <span className="muted">day current streak 🔥</span>
            </div>
          </div>
          <div className="cal">
            {calendar.map((c) => (
              <div
                key={c.day}
                className={`cal-cell ${levelFor(c.words)}`}
                title={`${prettyDay(c.day)} — ${c.words} word${c.words === 1 ? "" : "s"}`}
              />
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
            last 12 weeks · darker = more words
          </p>
        </div>

        <div className="section-title">
          <h2>Sessions</h2>
          <span className="faint">
            {summary.totalEntries} total · {summary.totalMinutes} min written
          </span>
        </div>
        <div className="card">
          <span className="eyebrow">Recent session length (words)</span>
          <div className="spark" style={{ marginTop: 12 }}>
            {summary.recentLengths.map((w, i) => (
              <div
                key={i}
                className="spark-bar"
                style={{ height: `${Math.max(6, (w / sparkMax) * 100)}%` }}
                title={`${w} words`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
