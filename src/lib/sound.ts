/**
 * A short, soft "you did it" chime. Invest in the micro-win moment — finishing
 * today's writing should feel a little bit delightful. Played only on a user
 * gesture (the Done button), so autoplay policies are satisfied.
 */
export function playChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // A gentle major arpeggio: C5, E5, G5, C6.
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.085;
      const peak = 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });

    // Tidy up the context shortly after the sound finishes.
    window.setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* audio unavailable — no problem */
  }
}
