import { useEffect, useState } from "react";
import { useStore } from "@/store/StoreContext";
import type { Entry } from "@/types";
import { Confetti } from "./Confetti";
import { playChime } from "@/lib/client/sound";
import { todayKey } from "@/lib/shared/date";
import { streakInfo } from "@/lib/shared/streak";

interface CelebrateProps {
  entry: Entry;
  onFeedback: () => void;
  onDone: () => void;
}

function useCountUp(target: number, duration = 750): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export function Celebrate({ entry, onFeedback, onDone }: CelebrateProps) {
  const { store } = useStore();
  const info = streakInfo(store.profile, todayKey());

  useEffect(() => {
    if (store.settings.sound) playChime();
    // Sound is keyed to this mount (which follows the Done click), so the
    // browser treats it as a user gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = useCountUp(entry.words);
  const newWords = useCountUp(entry.newWords);
  const streak = useCountUp(info.streak);

  const title =
    info.streak > 1
      ? `Day ${info.streak}. You kept it going.`
      : "That's done. You kept the pen moving.";

  return (
    <div className="screen screen-pad">
      <Confetti />
      <div className="container celebrate center-narrow">
        <div className="burst">🎉</div>
        <h1>{title}</h1>
        <p className="sub">
          {entry.newWords > 0
            ? "You stretched your English a little further today."
            : "Showing up is the skill. You just practiced it."}
        </p>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-num">{words}</div>
            <div className="stat-label">words written</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              <span className="accent">{newWords}</span>
            </div>
            <div className="stat-label">new words used</div>
          </div>
          <div className="stat">
            <div className="stat-num">{streak} 🔥</div>
            <div className="stat-label">day streak</div>
          </div>
        </div>

        <div className="celebrate-actions">
          <button className="btn btn-primary btn-lg" onClick={onFeedback}>
            Get gentle feedback
          </button>
          <button className="btn btn-ghost" onClick={onDone}>
            Not now — back home
          </button>
        </div>
      </div>
    </div>
  );
}
