"use client";

/**
 * The voice behind a curated clip (docs/TRANSCRIBE.md).
 *
 * Transcribe needs audio, and the one non-negotiable it must not break is that
 * the core loop works with no account, no network and no keys. A curated clip
 * therefore ships its transcript and is read aloud by the browser's own speech
 * synthesis, at the playback rate the learner picked.
 *
 * This is honestly a compromise and the UI says so: a synthesized voice has
 * none of the elision and connected speech that make real narration worth
 * transcribing. It is the offline floor, not the ideal. A clip that carries a
 * `videoId` plays as real video instead, and switching a curated clip over is
 * a one-field change in `lib/shared/clips.ts`.
 */

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Prefer a real en-* voice; fall back to whatever the platform offers. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("en-gb")) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
    voices[0]
  );
}

export interface SpeechHandle {
  cancel(): void;
}

/**
 * Read one chunk aloud. `onEnd` fires on natural completion only — a cancelled
 * utterance is the caller's own doing, so looping never double-fires.
 */
export function speakChunk(
  text: string,
  rate: number,
  onEnd?: () => void,
): SpeechHandle {
  if (!speechSupported()) {
    onEnd?.();
    return { cancel: () => {} };
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.max(0.1, Math.min(2, rate));
  utterance.lang = "en-GB";
  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  let cancelled = false;
  utterance.onend = () => {
    if (!cancelled) onEnd?.();
  };
  // A synthesis error must not strand the pane in "playing" forever.
  utterance.onerror = () => {
    if (!cancelled) onEnd?.();
  };

  synth.speak(utterance);

  return {
    cancel() {
      cancelled = true;
      synth.cancel();
    },
  };
}
