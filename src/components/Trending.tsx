import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { Scenario, Trend } from "@/types";
import { fetchTrends, createScenario } from "@/lib/client/clientApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";

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
    <PageContainer width="wide">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl">🔥 Trending</h1>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Write about what the world&apos;s talking about — pick a subject and it
        becomes a short, interactive flow.
      </p>

      {error && <div className="note note-warning mt-3">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-3 py-5 text-muted-foreground">
          <span className="spinner" />
          <span>Finding what&apos;s trending…</span>
        </div>
      ) : (
        <>
          {usingFallback && (
            <div className="note note-positive mt-3">
              Live trends aren&apos;t available here yet — here are some evergreen
              subjects to write about. (They go live once deployed.)
            </div>
          )}
          {groups.map(([platform, items]) => (
            <section key={platform} className="mt-7">
              <Badge variant="eyebrow">{platform}</Badge>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                {items.map((t) => (
                  <Card
                    key={t.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{t.title}</div>
                      {t.blurb && (
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {t.blurb}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="sage"
                      size="sm"
                      className="shrink-0"
                      onClick={() => pick(t)}
                      disabled={genId !== null}
                    >
                      {genId === t.id ? (
                        <>
                          <span className="spinner spinner-sm" /> Building…
                        </>
                      ) : (
                        <>
                          Write <ArrowRight />
                        </>
                      )}
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </PageContainer>
  );
}
