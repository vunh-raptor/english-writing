import { useEffect, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useStore } from "@/store/StoreContext";
import type { NewsLevel } from "@/types";
import { WORDS_PER_DAY_OPTIONS } from "@/lib/shared/words";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/page-container";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

const LEVEL_BLURB: Record<NewsLevel, string> = {
  A2: "Everyday basics — short, concrete sentences.",
  B1: "Comfortable with familiar topics; still building range.",
  B2: "Fluent on most subjects; reaching for precision.",
  C1: "Confident and nuanced; hunting the exact word.",
};

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
  const { store, updateSettings, setLevel, reset } = useStore();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const s = store.settings;

  function handleReset() {
    const ok = window.confirm(
      "Erase your words, streak, and settings from this browser? This can't be undone.",
    );
    if (ok) reset();
  }

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
          label="New words a day"
          desc="Your daily dose. A small set you always finish beats a long one you abandon — and reviews are added on top automatically."
        >
          <Seg
            options={WORDS_PER_DAY_OPTIONS.map((v) => ({ value: v, label: String(v) }))}
            value={s.wordsPerDay}
            onChange={(v) => updateSettings({ wordsPerDay: v as number })}
          />
        </Row>

        <Row
          block
          label="Your level"
          desc="Which band your daily words are drawn from, and how News Chat plans its missions. It moves on its own as you produce more — set it here if it feels off."
        >
          <div className="mt-3 flex flex-wrap gap-2">
            {LEVELS.map((l) => {
              const on = store.newsLevel === l;
              return (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  aria-pressed={on}
                  title={LEVEL_BLURB[l]}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-none border px-3 py-2 font-mono text-sm transition-colors",
                    on
                      ? "border-brand bg-brand/10 font-semibold text-brand"
                      : "border-input bg-card text-muted-foreground hover:border-brand/60 hover:text-foreground",
                  )}
                >
                  {l}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {LEVEL_BLURB[store.newsLevel]}
          </p>
        </Row>

        <Row
          label="Finish sound"
          desc="A little chime when you land a session."
        >
          <Switch
            checked={s.sound}
            onCheckedChange={(v) => updateSettings({ sound: v })}
            aria-label="Toggle finish sound"
          />
        </Row>
      </Card>

      <Separator className="my-7" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-destructive">Erase everything</div>
          <div className="mt-0.5 max-w-[46ch] text-sm text-muted-foreground">
            Remove every word you&apos;ve collected, your streak, and your
            settings from this browser.
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
