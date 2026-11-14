"use client";

import { ArrowRight, Check } from "lucide-react";
import type { ArenaBout, ArenaStation } from "@/types";
import { SRS_INTERVALS } from "@/lib/shared/srs";
import { hasPartnerChunk, itemOutcome, nativeProgress } from "@/lib/shared/arena";
import { cn } from "@/lib/utils";
import { NativeMeter } from "./NativeMeter";
import { STATION_META } from "./meta";

/** "comes back…" copy for an item, from what the bout earned it. */
function returnsLabel(clean: boolean, prevBox: number): string {
  if (!clean) return "Comes back tomorrow";
  const days = SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, prevBox + 1)];
  if (days <= 1) return "Comes back tomorrow";
  if (days === 7) return "Comes back in a week";
  return `Comes back in ${days} days`;
}

/**
 * The end of a bout. It leads with what landed — the sentences are theirs, and
 * they are the point — then shows each item's Native bar with what this bout
 * added ringed. What slipped is named plainly and without colour: it comes
 * back on the schedule, which is the whole consequence.
 */
export function ArenaDebrief({
  bout,
  onBook,
  onAgain,
  starting,
}: {
  bout: ArenaBout;
  onBook: () => void;
  onAgain: () => void;
  starting: boolean;
}) {
  const played = bout.turns.filter((t) => t.outcome !== null);
  const clean = played.filter((t) => t.outcome === "clean").length;
  const sentences = played.reduce((n, t) => n + t.talk.landed.length, 0);
  const combo = bout.turns.find((t) => t.station === "combo");

  return (
    <div className="dw min-h-full">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="dw-hero p-6 sm:p-7">
          <div className="kicker">The arena · bout over</div>
          <h2 className="mt-2 text-[30px] font-bold leading-tight tracking-tight">
            {clean} of {played.length} {played.length === 1 ? "station" : "stations"} clean, first time
          </h2>
          <p className="mt-2 text-[15.5px] text-muted-foreground">
            {sentences} {sentences === 1 ? "sentence" : "sentences"} of your own, every one of them right.
            {bout.endedEarly ? " You ended early — the stations you didn't reach keep their place." : ""}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {bout.items.map((item) => {
            const mine = bout.turns.filter((t) => t.itemId === item.id);
            const done = mine.filter((t) => t.outcome !== null);
            const fresh = [
              ...new Set(
                done
                  .filter((t) => t.outcome === "clean" && t.station !== "combo")
                  .map((t) => (t.rematch ? "recall" : t.station) as ArenaStation),
              ),
            ];
            const hasPartner = hasPartnerChunk(item.collocations, item.text);
            const before = nativeProgress(item.marksBefore, hasPartner).native;
            const after = nativeProgress([...item.marksBefore, ...fresh], hasPartner).native;
            const finished = mine.length > 0 && done.length === mine.length;
            const outcome = finished ? itemOutcome(done.map((t) => t.outcome!)) : null;
            const lines = done.flatMap((t) => t.talk.landed);

            return (
              <div key={item.id} className="dw-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[19px] font-bold tracking-tight">{item.text}</span>
                    {after && !before && (
                      <span className="dw-chip dw-chip-good dw-pop">
                        <Check className="size-3.5" /> Native now
                      </span>
                    )}
                  </div>
                  <NativeMeter earned={item.marksBefore} fresh={fresh} hasPartner={hasPartner} size="lg" />
                </div>

                {fresh.length > 0 && (
                  <p className="mt-2 text-[14px] text-[hsl(var(--dw-good))]">
                    Landed clean: {fresh.map((s) => STATION_META[s].label.toLowerCase()).join(", ")}
                  </p>
                )}

                {lines.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {lines.map((l, k) => (
                      <li key={k} className="dw-bubble-you text-[15.5px] leading-relaxed">
                        {l}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-[13.5px] text-muted-foreground">
                  {outcome === null
                    ? "Not finished this bout — its schedule hasn't moved."
                    : `${returnsLabel(outcome === "clean", item.prevBox)}.`}
                </p>
              </div>
            );
          })}

          {combo && combo.outcome !== null && combo.talk.landed[0] && (
            <div className="dw-card p-5">
              <span className="dw-chip dw-chip-accent">Combo</span>
              <p className="mt-2.5 text-[16px] leading-relaxed">{combo.talk.landed[0]}</p>
            </div>
          )}
        </div>

        <div className={cn("mt-7 flex flex-wrap items-center justify-end gap-3")}>
          <button type="button" className="dw-btn-quiet" onClick={onBook}>
            Back to your book
          </button>
          <button type="button" className="dw-btn" onClick={onAgain} disabled={starting}>
            {starting ? "Setting up…" : "Another bout"} <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
