import { useEffect, useState } from "react";
import { useStore } from "@/store/StoreContext";
import type { Entry } from "@/types";
import { Confetti } from "./Confetti";
import { playChime } from "@/lib/client/sound";
import { todayKey } from "@/lib/shared/date";
import { streakInfo } from "@/lib/shared/streak";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";

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

function Stat({
  value,
  label,
  accent,
}: {
  value: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div
        className={cn(
          "font-serif text-3xl font-semibold",
          accent && "text-brand",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </Card>
  );
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
    <div className="relative">
      <Confetti />
      <PageContainer width="narrow" className="text-center">
        <div className="animate-pop text-6xl leading-none">🎉</div>
        <h1 className="mt-4 text-3xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">
          {entry.newWords > 0
            ? "You stretched your English a little further today."
            : "Showing up is the skill. You just practiced it."}
        </p>

        <div className="my-7 grid grid-cols-3 gap-3">
          <Stat value={words} label="words written" />
          <Stat value={newWords} label="new words used" accent />
          <Stat value={`${streak} 🔥`} label="day streak" />
        </div>

        <div className="mx-auto flex max-w-sm flex-col gap-2.5">
          <Button size="lg" onClick={onFeedback}>
            Get gentle feedback
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Not now — back home
          </Button>
        </div>
      </PageContainer>
    </div>
  );
}
