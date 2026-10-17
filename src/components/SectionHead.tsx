"use client";

import { useProgress } from "./progress";

export default function SectionHead({
  index,
  title,
  anchor,
}: {
  index: number;
  title: string;
  anchor: string;
}) {
  const { completed, toggle, ready } = useProgress();
  const done = Boolean(completed[anchor]);

  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-edge pb-4">
      <div className="min-w-0">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent2/90">
          Bagian {index + 1}
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={() => toggle(anchor)}
        disabled={!ready}
        aria-pressed={done}
        className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
          done
            ? "border-ok/50 bg-ok/15 text-ok"
            : "border-edge bg-surface2 text-muted hover:border-accent/70 hover:text-ink"
        } ${!ready ? "opacity-60" : ""}`}
      >
        {done ? "✓ Selesai" : "Tandai selesai"}
      </button>
    </div>
  );
}
