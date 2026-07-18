import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useStore } from "@/store/StoreContext";
import { THEMES } from "@/lib/shared/prompts";
import type { Difficulty, GoalType } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/page-container";

const TIME_OPTIONS = [120, 180, 300, 600]; // seconds
const WORD_OPTIONS = [50, 100, 150, 250];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Gentle",
  2: "Steady",
  3: "Stretch",
};

function timeLabel(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

type SegOption = { value: string | number; label: string };

/** Pill segmented control used throughout Settings. */
function Seg({
  options,
  value,
  onChange,
}: {
  options: SegOption[];
  value: string | number;
  onChange: (value: string | number) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-none border border-border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-none px-3.5 py-1.5 text-sm transition-colors",
            value === o.value
              ? "bg-card font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A single settings row: label + description on the left, control on the right. */
function Row({
  label,
  desc,
  children,
  block,
  danger,
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  block?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-4 border-b border-border py-4 last:border-0",
        block ? "flex-col" : "items-center justify-between",
      )}
    >
      <div>
        <div className={cn("font-medium", danger && "text-destructive")}>
          {label}
        </div>
        {desc && (
          <div className="mt-0.5 max-w-[46ch] text-sm text-muted-foreground">
            {desc}
          </div>
        )}
      </div>
      {children && <div className={block ? "" : "shrink-0"}>{children}</div>}
    </div>
  );
}

export function Settings() {
  const { store, updateSettings, reset } = useStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const s = store.settings;

  function setGoalType(goalType: GoalType) {
    updateSettings({
      goalType,
      goalValue: goalType === "time" ? 300 : 100,
    });
  }

  function toggleFocus(id: string) {
    const set = new Set(s.focuses);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    updateSettings({ focuses: [...set] });
  }

  function handleReset() {
    const ok = window.confirm(
      "Erase all your writing, streak, and settings from this browser? This can't be undone.",
    );
    if (ok) reset();
  }

  const ai = s.ai;

  return (
    <PageContainer width="narrow">
      <h1 className="text-2xl sm:text-3xl">Settings</h1>

      <Card className="mt-5 px-5 py-1 sm:px-6">
        <Row
          label="Appearance"
          desc="Light, dark, or match your device automatically."
        >
          <Seg
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "Auto" },
            ]}
            value={mounted ? theme ?? "system" : "system"}
            onChange={(v) => setTheme(String(v))}
          />
        </Row>
      </Card>

      <Card className="mt-4 px-5 py-1 sm:px-6">
        <Row label="Your name" desc="Just so we can say hello. Optional.">
          <Input
            className="max-w-[160px]"
            value={s.name}
            placeholder="optional"
            onChange={(e) => updateSettings({ name: e.target.value })}
          />
        </Row>

        <Row
          label="Session goal"
          desc="A goal reframes success as momentum. The point is to not stop — not to be perfect."
        >
          <Seg
            options={[
              { value: "time", label: "Time" },
              { value: "words", label: "Words" },
            ]}
            value={s.goalType}
            onChange={(v) => setGoalType(v as GoalType)}
          />
        </Row>

        <Row label={s.goalType === "time" ? "How long" : "How many words"}>
          <Seg
            options={(s.goalType === "time" ? TIME_OPTIONS : WORD_OPTIONS).map(
              (v) => ({
                value: v,
                label: s.goalType === "time" ? timeLabel(v) : String(v),
              }),
            )}
            value={s.goalValue}
            onChange={(v) => updateSettings({ goalValue: v as number })}
          />
        </Row>

        <Row
          label="Prompt difficulty"
          desc="Match the challenge to your level — too hard brings anxiety, too easy brings boredom."
        >
          <Seg
            options={([1, 2, 3] as Difficulty[]).map((d) => ({
              value: d,
              label: DIFFICULTY_LABELS[d],
            }))}
            value={s.difficulty}
            onChange={(v) => updateSettings({ difficulty: v as Difficulty })}
          />
        </Row>

        <Row
          block
          label="What are you practicing for?"
          desc="Pick the real-life areas you want prompts from — your prompts (and any you generate with AI) come from these. Leave all off for a bit of everything."
        >
          <div className="mt-3 flex flex-wrap gap-2">
            {THEMES.map((t) => {
              const on = s.focuses.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleFocus(t.id)}
                  aria-pressed={on}
                  title={t.blurb}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-none border px-3 py-2 text-sm transition-colors",
                    on
                      ? "border-brand bg-brand/10 font-semibold text-brand"
                      : "border-input bg-card text-muted-foreground hover:border-brand/60 hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </Row>

        <Row
          label={<>&quot;Keep going&quot; nudge</>}
          desc="A gentle pulse if you pause mid-session. Never deletes anything."
        >
          <Switch
            checked={s.gentleNudge}
            onCheckedChange={(v) => updateSettings({ gentleNudge: v })}
            aria-label="Toggle keep-going nudge"
          />
        </Row>

        <Row
          label="Finish sound"
          desc="A little chime when you complete a session."
        >
          <Switch
            checked={s.sound}
            onCheckedChange={(v) => updateSettings({ sound: v })}
            aria-label="Toggle finish sound"
          />
        </Row>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">AI feedback</h2>
      <Card className="px-5 py-1 sm:px-6">
        <Row
          label="Use AI for feedback & fresh prompts"
          desc="Optional. Warmer, more personal feedback after you write, plus “generate fresh” prompts. Runs on our server using free-tier AI — no key needed here. The app works fully without it."
        >
          <Switch
            checked={ai.enabled}
            onCheckedChange={(v) =>
              updateSettings({ ai: { ...ai, enabled: v } })
            }
            aria-label="Toggle AI feedback"
          />
        </Row>
      </Card>

      <Separator className="my-7" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-destructive">Erase everything</div>
          <div className="mt-0.5 max-w-[46ch] text-sm text-muted-foreground">
            Remove all writing, stats, and settings from this browser.
          </div>
        </div>
        <Button
          variant="outline"
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleReset}
        >
          <Trash2 /> Erase
        </Button>
      </div>
    </PageContainer>
  );
}
