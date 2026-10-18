"use client";

import { PLATFORM_GROUPS } from "@/lib/platforms";

/**
 * Platform chips used in the search dropdown (pick one → ingest starts) and
 * in the game header picker (pick one → label changes).
 */
export default function PlatformChips({
  value = null,
  onPick,
  allLabel = "Semua platform",
}: {
  value?: string | null;
  onPick: (platform: string | null) => void;
  allLabel?: string;
}) {
  const chip = (selected: boolean) =>
    `rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
      selected
        ? "border-accent/60 bg-accent/15 font-medium text-accent"
        : "border-edge bg-surface2 text-muted hover:border-accent/40 hover:text-ink"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0" aria-hidden />
        <button
          type="button"
          onClick={() => onPick(null)}
          className={chip(!value)}
        >
          {allLabel}
        </button>
      </div>
      {PLATFORM_GROUPS.map((group) => (
        <div
          key={group.label}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="w-14 shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted/70">
            {group.label}
          </span>
          {group.items.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className={chip(value === p)}
            >
              {p}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
