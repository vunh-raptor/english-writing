"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Highlight-to-save: wrap any reading surface and a quiet "Save" chip appears
 * over the learner's text selection; one tap sends the selection (plus the
 * passage it sits in) to `onCapture` — the Phrasebook's capture entry point.
 *
 * Context comes from the nearest ancestor marked `data-capture-context`, so
 * the enrichment prompt sees the sentence the phrase lived in. Selections
 * inside inputs/textareas are ignored — the learner's live draft is theirs.
 */

/** Words, phrases, sentences — not paragraphs. */
const MAX_CAPTURE_CHARS = 200;
const MIN_CAPTURE_CHARS = 2;
/** How long the "Saved" confirmation lingers. */
const SAVED_MS = 1400;

interface Pending {
  text: string;
  context: string;
  x: number;
  y: number;
  status: "idle" | "saving" | "saved";
}

/** The passage around a selection: nearest data-capture-context ancestor. */
function contextOf(node: Node, root: HTMLElement): string {
  let el: HTMLElement | null = node instanceof HTMLElement ? node : node.parentElement;
  while (el && el !== root && el.dataset.captureContext === undefined) {
    el = el.parentElement;
  }
  const source = el && el !== root ? el : null;
  return (source?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
}

export function SelectionCapture({
  onCapture,
  disabled,
  className,
  children,
}: {
  /** Persist the capture; resolve when saved (enriched or raw — never fails). */
  onCapture: (text: string, context: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const readSelection = useCallback(() => {
    // Never clobber an in-flight or just-confirmed save.
    setPending((prev) => {
      if (prev && prev.status !== "idle") return prev;

      const root = wrapRef.current;
      if (disabled || !root) return null;
      const active = document.activeElement;
      if (active && /^(TEXTAREA|INPUT)$/.test(active.tagName)) return null;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return null;

      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (text.length < MIN_CAPTURE_CHARS || text.length > MAX_CAPTURE_CHARS) return null;

      const rect = range.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const x = Math.min(
        Math.max(rect.left + rect.width / 2 - rootRect.left, 72),
        Math.max(rootRect.width - 72, 72),
      );
      const y = rect.top - rootRect.top;
      return {
        text,
        context: contextOf(range.commonAncestorContainer, root),
        x,
        y,
        status: "idle",
      };
    });
  }, [disabled]);

  /** Selections settle after mouseup/touchend — read on the next tick. */
  const onPointerDone = useCallback(() => {
    setTimeout(readSelection, 0);
  }, [readSelection]);

  const save = useCallback(async () => {
    const current = pending;
    if (!current || current.status !== "idle") return;
    setPending({ ...current, status: "saving" });
    await onCapture(current.text, current.context);
    setPending((p) => (p ? { ...p, status: "saved" } : p));
    window.getSelection()?.removeAllRanges();
    setTimeout(() => setPending(null), SAVED_MS);
  }, [pending, onCapture]);

  return (
    <div
      ref={wrapRef}
      className={cn("relative", className)}
      onMouseUp={onPointerDone}
      onTouchEnd={onPointerDone}
      onScrollCapture={() => setPending((p) => (p && p.status === "idle" ? null : p))}
    >
      {children}

      {pending && (
        <button
          type="button"
          // preventDefault keeps the selection alive through the click.
          onMouseDown={(e) => e.preventDefault()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={() => void save()}
          style={{ left: pending.x, top: pending.y }}
          className={cn(
            "absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide shadow-md transition-colors",
            "-mt-2",
            pending.status === "saved"
              ? "bg-sage text-sage-foreground"
              : "bg-foreground text-background hover:bg-brand hover:text-brand-foreground",
          )}
        >
          {pending.status === "saved" ? (
            <>
              <Check className="size-3.5" /> Saved to Phrasebook
            </>
          ) : pending.status === "saving" ? (
            <>Saving…</>
          ) : (
            <>
              <BookmarkPlus className="size-3.5" /> Save
            </>
          )}
        </button>
      )}
    </div>
  );
}
