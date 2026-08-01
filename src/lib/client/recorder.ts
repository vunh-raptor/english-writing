"use client";

/**
 * Shadowing capture — the learner's own voice, recorded once per chunk
 * (docs/TRANSCRIBE.md).
 *
 * Deliberately thin. Nothing here scores anything: the take is recorded so it
 * can be played back beside the speaker's, and the only number it yields is a
 * duration, so the learner can see they ran long. Scoring someone's mouth is
 * exactly the anxiety this product exists to remove, and the moment a
 * pronunciation percentage appears on this pane, people stop speaking.
 *
 * Browser-only by construction: `MediaRecorder` and `AudioContext` do not
 * exist on the server, and this module is never imported from one.
 */

/** How many bars the waveform draws — matches the pane's fixed strip. */
export const WAVEFORM_BARS = 56;

/** A take is capped so a stuck recorder can't fill memory. */
const MAX_TAKE_MS = 60_000;

export interface Take {
  /** Object URL for playback; revoke it when the take is replaced. */
  url: string;
  /** Seconds, to one decimal — the only measurement shadowing produces. */
  seconds: number;
  /** Normalized 0..1 peaks, ready to render as bars. */
  peaks: number[];
}

export function recordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Reduce raw samples to a fixed number of bars by peak-per-bucket. */
function toPeaks(samples: Float32Array, bars: number): number[] {
  const bucket = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  let max = 0;
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const start = b * bucket;
    for (let i = start; i < start + bucket && i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  // Normalize against the take's own loudest moment, so a quiet microphone
  // still draws a readable shape rather than a flat line.
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}

async function analyse(blob: Blob): Promise<{ seconds: number; peaks: number[] }> {
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return { seconds: 0, peaks: [] };
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return {
      seconds: Math.round(buffer.duration * 10) / 10,
      peaks: toPeaks(buffer.getChannelData(0), WAVEFORM_BARS),
    };
  } finally {
    void ctx.close();
  }
}

/**
 * One recording session. `start()` resolves once the microphone is live (so the
 * UI can show "recording" only when it truly is); `stop()` resolves with the
 * finished take.
 */
export class ShadowRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async start(): Promise<void> {
    if (!recordingSupported()) throw new Error("This browser can't record audio.");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.timer = setTimeout(() => this.recorder?.state === "recording" && this.recorder.stop(), MAX_TAKE_MS);
  }

  async stop(): Promise<Take> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Nothing is recording.");

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      if (recorder.state === "recording") recorder.stop();
      else resolve(new Blob(this.chunks, { type: recorder.mimeType }));
    });

    this.release();

    // A take that can't be decoded still counts as a take — the gate is that
    // they spoke, not that we could draw it.
    let measured = { seconds: 0, peaks: [] as number[] };
    try {
      measured = await analyse(blob);
    } catch {
      /* undecodable container — keep the audio, skip the picture */
    }
    return { url: URL.createObjectURL(blob), ...measured };
  }

  /** Drop the microphone without producing a take. */
  release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
