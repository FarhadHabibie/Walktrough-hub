"use client";

import { useEffect, useRef, useState } from "react";
import PlatformChips from "./PlatformChips";
import { setGamePlatform } from "@/lib/store";
import type { Game } from "@/lib/types";
import { useProgress, scrollToAnchor } from "./progress";

/** Chip that shows the game's platform and opens the picker to change it. */
function PlatformPicker({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Ubah platform"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors ${
          game.platform
            ? "border-edge bg-surface text-muted hover:border-accent/40 hover:text-ink"
            : "border-dashed border-edge text-muted/80 hover:border-accent/40 hover:text-ink"
        }`}
      >
        {game.platform ?? "Pilih platform"}
        <svg
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <span className="absolute left-0 top-full z-40 mt-2 block w-max max-w-[92vw] rounded-lg border border-edge bg-surface p-3 shadow-lg">
          <PlatformChips
            value={game.platform}
            onPick={(p) => {
              void setGamePlatform(game.slug, p);
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}

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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            {game.year && <span>{game.year}</span>}
            {game.year && (
              <span aria-hidden className="text-muted/50">
                ·
              </span>
            )}
            <PlatformPicker game={game} />
          </div>
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
