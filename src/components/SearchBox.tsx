"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/types";

type Result = Pick<
  Game,
  "slug" | "title" | "platform" | "year" | "cover_url" | "section_count"
>;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}

export default function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return; // dropdown is gated on term length at render
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (slug: string) => {
    setOpen(false);
    setQ("");
    setResults([]);
    router.push(`/games/${slug}`);
  };

  const hasQuery = q.trim().length >= 2;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!hasQuery || !open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = active >= 0 ? results[active] : results[0];
      if (pick) go(pick.slug);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-2xl">
      <div className="flex items-center gap-3 rounded-2xl border border-edge bg-surface px-4 py-3.5 shadow-lg shadow-black/20 transition focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
        <SearchIcon className="size-5 shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoFocus={autoFocus}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="wt-search-results"
          placeholder="Cari game… (contoh: elden ring, minecraft, terraria)"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/70"
        />
        {loading && (
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-edge border-t-accent" />
        )}
      </div>

      {open && (
        <div
          id="wt-search-results"
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl shadow-black/50"
        >
          {results.length === 0 && !loading ? (
            <div className="px-4 py-3.5 text-sm text-muted">
              Tidak ada game cocok untuk &ldquo;{q.trim()}&rdquo;.
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.slug}
                role="option"
                aria-selected={i === active}
                onClick={() => go(r.slug)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition ${
                  i === active ? "bg-surface2" : ""
                }`}
              >
                {r.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.cover_url}
                    alt=""
                    className="h-12 w-9 shrink-0 rounded-md border border-edge object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-9 shrink-0 place-items-center rounded-md border border-edge bg-surface2 font-mono text-sm text-muted">
                    {r.title.charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {r.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[r.year, r.platform].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-full border border-edge bg-surface2 px-2.5 py-0.5 font-mono text-[11px] text-muted">
                  {r.section_count} bagian
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
