import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scenario, Trend } from "@/types";
import { fetchTrends, createScenario } from "@/lib/client/clientApi";

interface TrendingProps {
  onStartScenario: (scenario: Scenario) => void;
}

/** Shown when live trends aren't available (offline / not deployed yet). */
const FALLBACK: Trend[] = [
  { id: "ed1", title: "AI making art and music", source: "editor", platform: "Editor's picks", blurb: "Creativity, or clever copying?" },
  { id: "ed2", title: "The four-day work week", source: "editor", platform: "Editor's picks", blurb: "Less pay for an extra day off?" },
  { id: "ed3", title: "A month with no social media", source: "editor", platform: "Editor's picks" },
  { id: "ed4", title: "Why short videos are everywhere", source: "editor", platform: "Editor's picks" },
  { id: "ed5", title: "Remote work vs. the office", source: "editor", platform: "Editor's picks" },
  { id: "ed6", title: "Electric cars taking over the roads", source: "editor", platform: "Editor's picks" },
];

export function Trending({ onStartScenario }: TrendingProps) {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [genId, setGenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const live = await fetchTrends();
      if (live.length > 0) {
        setTrends(live);
        setUsingFallback(false);
      } else {
        setTrends(FALLBACK);
        setUsingFallback(true);
      }
    } catch {
      setTrends(FALLBACK);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function pick(t: Trend) {
    setGenId(t.id);
    setError(null);
    try {
      const platform = t.platform === "Editor's picks" ? undefined : t.platform;
      const scenario = await createScenario(t.title, platform);
      onStartScenario(scenario);
    } catch {
      setError("Couldn't build a scenario just now — try another subject.");
    } finally {
      setGenId(null);
    }
  }

  const groups = useMemo(() => {
    const m: Record<string, Trend[]> = {};
    for (const t of trends) (m[t.platform] ||= []).push(t);
    return Object.entries(m);
  }, [trends]);

  return (
    <div className="screen screen-pad">
      <div className="container">
        <div className="section-title" style={{ marginTop: 6 }}>
          <h1 style={{ fontSize: 26 }}>🔥 Trending</h1>
          <button className="shuffle" onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Write about what the world's talking about — pick a subject and it
          becomes a short, interactive flow.
        </p>

        {error && <div className="status-note warn" style={{ marginTop: 12 }}>{error}</div>}

        {loading ? (
          <div className="loading-row">
            <span className="spinner" />
            <span>Finding what's trending…</span>
          </div>
        ) : (
          <>
            {usingFallback && (
              <div className="status-note" style={{ marginTop: 12 }}>
                Live trends aren't available here yet — here are some evergreen
                subjects to write about. (They go live once deployed.)
              </div>
            )}
            {groups.map(([platform, items]) => (
              <div key={platform} style={{ marginTop: 22 }}>
                <span className="eyebrow">{platform}</span>
                <div className="trend-list">
                  {items.map((t) => (
                    <div className="trend-card" key={t.id}>
                      <div className="trend-main">
                        <div className="trend-title">{t.title}</div>
                        {t.blurb && <div className="trend-blurb">{t.blurb}</div>}
                      </div>
                      <button
                        className="btn btn-sage trend-go"
                        onClick={() => pick(t)}
                        disabled={genId !== null}
                      >
                        {genId === t.id ? (
                          <>
                            <span className="spinner spinner-sm" /> Building…
                          </>
                        ) : (
                          <>Write about this →</>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
