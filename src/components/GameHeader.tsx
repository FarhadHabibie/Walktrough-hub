"use client";

import type { Game } from "@/lib/types";
import { useProgress, scrollToAnchor } from "./progress";

export default function GameHeader({ game }: { game: Game }) {
  const { ready, doneCount, total, nextAnchor, sections, reset } =
    useProgress();
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const nextTitle = sections.find((s) => s.anchor === nextAnchor)?.title ?? null;
  const allDone = ready && total > 0 && doneCount === total;

  return (
    <div className="mb-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative h-56 w-40 shrink-0 overflow-hidden rounded-xl border border-edge bg-surface2 sm:h-64 sm:w-48">
          {game.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.cover_url}
              alt={`Cover ${game.title}`}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-surface2">
              <span className="font-mono text-5xl font-bold text-muted/60">
                {game.title.charAt(0)}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-md border border-edge bg-surface px-2 py-0.5">
              {total} bagian
            </span>
            {game.wiki_name && (
              <span className="rounded-md border border-edge bg-surface px-2 py-0.5">
                {game.wiki_name}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {game.title}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {[game.year || null, game.platform].filter(Boolean).join(" · ")}
          </p>
          {game.description && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink/80">
              {game.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-7 rounded-xl border border-edge bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">
                Progres baca{" "}
                <span className="font-mono text-xs text-muted">
                  {ready ? `${doneCount}/${total}` : "…"}
                </span>
              </span>
              <span className="font-mono text-xs text-muted">{pct}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {(ready && doneCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Reset progres baca untuk game ini?")) {
                    reset();
                  }
                }}
                className="rounded-lg border border-edge bg-surface2 px-3.5 py-2 text-xs text-muted transition-colors hover:border-red-400/50 hover:text-red-300"
              >
                Reset
              </button>
            )}
            {allDone ? (
              <span className="rounded-md border border-ok/50 bg-ok/15 px-3.5 py-2 text-xs font-medium text-ok">
                Semua bagian selesai
              </span>
            ) : (
              <button
                type="button"
                disabled={!ready || !nextAnchor}
                onClick={() => scrollToAnchor(nextAnchor)}
                className="max-w-[240px] truncate rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
              >
                {doneCount > 0 ? "Lanjut" : "Mulai baca"}
                {nextTitle ? `: ${nextTitle}` : ""}
              </button>
            )}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted/80">
          Progres disimpan otomatis di browser ini (localStorage). Tanpa akun,
          tanpa server.
        </p>
      </div>
    </div>
  );
}
