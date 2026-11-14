import type { ArenaStation } from "@/types";
import { ladderFor } from "@/lib/shared/arena";
import { cn } from "@/lib/utils";
import { STATION_META } from "./meta";

/**
 * How far an item is from Native: one segment per station on its ladder.
 * Earned before is solid; earned in the bout just played is solid with a ring,
 * so the debrief shows what today added. Nothing here ever goes red or empties
 * out — a mark, once earned, is the ledger's and stays.
 */
export function NativeMeter({
  earned,
  fresh = [],
  hasPartner,
  size = "sm",
}: {
  earned: readonly ArenaStation[];
  fresh?: readonly ArenaStation[];
  hasPartner: boolean;
  size?: "sm" | "lg";
}) {
  const ladder = ladderFor(hasPartner);
  const have = new Set([...earned, ...fresh]);
  const isFresh = new Set(fresh.filter((s) => !earned.includes(s)));
  const n = ladder.filter((s) => have.has(s)).length;
  const native = n === ladder.length;
  return (
    <span
      className="inline-flex items-center gap-2"
      title={native ? "Native — landed clean at every station" : `${n} of ${ladder.length} stations landed clean`}
    >
      <span className="inline-flex gap-[3px]" aria-hidden>
        {ladder.map((s) => (
          <span
            key={s}
            title={STATION_META[s].label}
            className={cn(
              "rounded-full transition-colors",
              size === "lg" ? "h-2 w-7" : "h-1.5 w-3.5",
              have.has(s) ? "bg-[hsl(var(--dw-good))]" : "bg-muted",
              isFresh.has(s) && "ring-2 ring-[hsl(var(--dw-good-soft))] ring-offset-1 ring-offset-card",
            )}
          />
        ))}
      </span>
      {size === "lg" && (
        <span className="text-[12.5px] font-medium tabular-nums text-muted-foreground">
          {native ? "Native" : `${n}/${ladder.length}`}
        </span>
      )}
      <span className="sr-only">{native ? "Native" : `${n} of ${ladder.length} stations`}</span>
    </span>
  );
}
