import { useMemo } from "react";

const COLORS = ["#c8643c", "#d9a441", "#4f7a6f", "#e0894f", "#6fae9c", "#eab891"];

/** Lightweight CSS confetti for the celebrate moment. Decorative only. */
export function Confetti({ pieces = 90 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const duration = 2.4 + Math.random() * 1.8;
        const color = COLORS[i % COLORS.length];
        const rotate = Math.random() * 360;
        const drift = (Math.random() - 0.5) * 40;
        return { left, delay, duration, color, rotate, drift, i };
      }),
    [pieces],
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      aria-hidden="true"
    >
      {bits.map((b) => (
        <i
          key={b.i}
          className="confetti-piece"
          style={{
            left: `${b.left}%`,
            background: b.color,
            transform: `rotate(${b.rotate}deg)`,
            marginLeft: `${b.drift}px`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
