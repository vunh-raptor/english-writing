"use client";

import type { TranscribeChunk } from "@/types";
import { speakChunk, speechSupported, type SpeechHandle } from "./speech";

/**
 * Playing one fifteen-second chunk, over and over, at whatever speed the
 * learner needs (docs/TRANSCRIBE.md).
 *
 * Two backends behind one interface, chosen by whether the clip has a video
 * behind it:
 *
 *   youtube — the real thing. Seeks to the chunk, plays to its end, loops.
 *   speech  — the browser reading the bundled transcript aloud. The offline
 *             floor, so a curated clip works with no network at all.
 *
 * The interface is deliberately chunk-shaped rather than time-shaped: nothing
 * in this mode ever plays "the video", only ever one chunk of it. That is the
 * whole pedagogy — a bounded piece of listening you can exhaust.
 */

export interface PlayOptions {
  rate: number;
  loop: boolean;
  /** Fires when the chunk finishes and is NOT looping. */
  onEnd?: () => void;
}

export interface ChunkPlayer {
  play(chunk: TranscribeChunk, opts: PlayOptions): void;
  stop(): void;
  destroy(): void;
  /** What to tell the learner they are listening to. */
  readonly kind: "youtube" | "speech";
}

// ---------------------------------------------------------------------------
// Speech — the offline floor
// ---------------------------------------------------------------------------

class SpeechPlayer implements ChunkPlayer {
  readonly kind = "speech" as const;
  private handle: SpeechHandle | null = null;
  private stopped = false;

  play(chunk: TranscribeChunk, opts: PlayOptions): void {
    this.stop();
    this.stopped = false;
    const speak = () => {
      this.handle = speakChunk(chunk.text, opts.rate, () => {
        if (this.stopped) return;
        if (opts.loop) speak();
        else opts.onEnd?.();
      });
    };
    speak();
  }

  stop(): void {
    this.stopped = true;
    this.handle?.cancel();
    this.handle = null;
  }

  destroy(): void {
    this.stop();
  }
}

// ---------------------------------------------------------------------------
// YouTube — the real thing
// ---------------------------------------------------------------------------

/** The slice of the IFrame API this uses. Typed here rather than pulling in a
 *  whole ambient package for five methods. */
interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    config: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";
let apiPromise: Promise<YTNamespace> | null = null;

/** Load the IFrame API once per page, however many players ask for it. */
function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("The video player didn't load."));
    };
    const tag = document.createElement("script");
    tag.src = API_SRC;
    tag.async = true;
    tag.onerror = () => reject(new Error("The video player didn't load."));
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/** How often the loop watcher checks whether the chunk has run out. */
const TICK_MS = 120;

class YouTubePlayer implements ChunkPlayer {
  readonly kind = "youtube" as const;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private player: YTPlayer) {}

  play(chunk: TranscribeChunk, opts: PlayOptions): void {
    this.clearTimer();
    this.player.setPlaybackRate(opts.rate);
    this.player.seekTo(chunk.start, true);
    this.player.playVideo();

    // The API has no "play this range" call, so the end of a chunk is watched
    // for rather than scheduled — a rate change mid-chunk would invalidate any
    // timeout we set up front.
    this.timer = setInterval(() => {
      if (this.player.getCurrentTime() < chunk.end) return;
      if (opts.loop) {
        this.player.seekTo(chunk.start, true);
        return;
      }
      this.stop();
      opts.onEnd?.();
    }, TICK_MS);
  }

  stop(): void {
    this.clearTimer();
    try {
      this.player.pauseVideo();
    } catch {
      /* the iframe may already be gone */
    }
  }

  destroy(): void {
    this.clearTimer();
    try {
      this.player.destroy();
    } catch {
      /* already torn down */
    }
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

// ---------------------------------------------------------------------------

/**
 * Build the right player for a clip. A clip with a `videoId` gets the real
 * video; everything else gets the browser's voice. Falls back to speech if the
 * IFrame API can't be reached, so a flaky network degrades to something that
 * still teaches rather than to a dead pane.
 */
export async function createPlayer(
  mount: HTMLElement | null,
  videoId?: string,
): Promise<ChunkPlayer> {
  if (videoId && mount) {
    try {
      const YT = await loadApi();
      const player = await new Promise<YTPlayer>((resolve) => {
        const p = new YT.Player(mount, {
          videoId,
          playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
          events: { onReady: () => resolve(p) },
        });
      });
      return new YouTubePlayer(player);
    } catch {
      /* fall through to the voice */
    }
  }
  return new SpeechPlayer();
}

export { speechSupported };
