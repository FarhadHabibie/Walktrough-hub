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
      <h2 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">
        <span className="mr-2.5 font-pixel text-[13px] font-normal text-accent/90 sm:text-[15px]">
          {String(index + 1).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <button
        type="button"
        onClick={() => toggle(anchor)}
        disabled={!ready}
        aria-pressed={done}
        className={`shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wide transition-colors ${
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
