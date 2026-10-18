"use client";

import { useEffect, useRef, useState } from "react";
import PlatformChips from "@/components/PlatformChips";
import { faqSource } from "@/lib/faq/client";
import { navigate } from "@/lib/router";
import { slugify } from "@/lib/slug";
import { searchGames } from "@/lib/store";
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
  const [platformStep, setPlatformStep] = useState(false);
  const [faqKind, setFaqKind] = useState<"native" | "server" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return; // dropdown is gated on term length at render
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchGames(term, 10);
        setResults(
          found.map((g) => ({
            slug: g.slug,
            title: g.title,
            platform: g.platform,
            year: g.year,
            cover_url: g.cover_url,
            section_count: g.section_count,
          })),
        );
      } catch {
        setResults([]);
      } finally {
        setActive(-1);
        setPlatformStep(false);
        setOpen(true);
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

  // GameFAQs option is only offered where fetching is possible: inside the
  // Android app (native plugin) or behind the desktop's local server.
  useEffect(() => {
    let alive = true;
    void faqSource().then((kind) => {
      if (alive) setFaqKind(kind);
    });
    return () => {
      alive = false;
    };
  }, []);

  const go = (slug: string) => {
    setOpen(false);
    setPlatformStep(false);
    setQ("");
    setResults([]);
    navigate(`/games/${slug}`);
  };

  /** Fetch a game straight from public wikis on first open. */
  const openFromWiki = (platform: string | null) => {
    const term = q.trim();
    const slug = slugify(term);
    if (term.length < 2 || !slug) return;
    setOpen(false);
    setPlatformStep(false);
    setQ("");
    setResults([]);
    const params = new URLSearchParams({ title: term });
    if (platform) params.set("platform", platform);
    navigate(`/games/${slug}?${params.toString()}`);
  };

  /** Fetch a walkthrough from GameFAQs (local server / native plugin). */
  const openFromFaq = () => {
    const term = q.trim();
    const slug = slugify(term);
    if (term.length < 2 || !slug) return;
    setOpen(false);
    setPlatformStep(false);
    setQ("");
    setResults([]);
    const params = new URLSearchParams({ title: term, faq: "1" });
    navigate(`/games/${slug}?${params.toString()}`);
  };

  const hasQuery = q.trim().length >= 2;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!hasQuery || !open) return;
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = active >= 0 ? results[active] : results[0];
      if (pick) go(pick.slug);
      else setPlatformStep(true);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-2xl">
      <div className="flex items-center gap-3 rounded-lg border-2 border-edge bg-surface px-4 py-3 transition-colors focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/20">
        <SearchIcon className="size-5 shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoFocus={autoFocus}
          type="text"
          role="combobox"
          aria-label="Cari game"
          aria-expanded={open}
          aria-controls="wt-search-results"
          placeholder="Cari game… (contoh: elden ring, minecraft, terraria)"
          className="w-full bg-transparent font-mono text-sm text-ink outline-none placeholder:text-muted/70"
        />
        {loading && (
          <span aria-hidden className="blink shrink-0 font-pixel text-sm text-accent">
            ▮
          </span>
        )}
      </div>

      {open && hasQuery && (
        <div
          id="wt-search-results"
          role={platformStep ? undefined : "listbox"}
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border-2 border-edge bg-surface pixel-shadow"
        >
          {results.length === 0 && !loading ? (
            <div className="px-3.5 py-3 text-sm text-muted">
              &ldquo;{q.trim()}&rdquo; belum ada di katalog — coba ambil
              langsung dari wiki:
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.slug}
                role="option"
                aria-selected={i === active}
                onClick={() => go(r.slug)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                  i === active ? "bg-surface2" : ""
                }`}
              >
                {r.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.cover_url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-12 w-9 shrink-0 rounded-md border border-edge object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-9 shrink-0 place-items-center rounded-md border border-edge bg-surface2 font-pixel text-sm text-muted">
                    {r.title.charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {r.title}
                  </span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-muted">
                    {[r.year, r.platform].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-edge bg-surface2 px-2 py-0.5 font-mono text-[11px] text-muted">
                  {r.section_count} bagian
                </span>
              </button>
            ))
          )}

          <div className="border-t border-edge">
            {!platformStep ? (
              <>
                <button
                  onClick={() => setPlatformStep(true)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface2"
                >
                  <span
                    aria-hidden
                    className="grid h-12 w-9 shrink-0 place-items-center rounded-md border border-edge bg-surface2 font-pixel text-base leading-none text-muted"
                  >
                    +
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-accent">
                      Ambil &ldquo;{q.trim()}&rdquo; dari wiki publik
                    </span>
                    <span className="block text-xs text-muted">
                      Pilih platform dulu (opsional) — walkthrough diambil
                      otomatis sekali, lalu tersimpan.
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-muted">
                    →
                  </span>
                </button>

                {faqKind && (
                  <button
                    onClick={openFromFaq}
                    className="flex w-full items-center gap-3 border-t border-edge px-3.5 py-3 text-left transition-colors hover:bg-surface2"
                  >
                    <span
                      aria-hidden
                      className="grid h-12 w-9 shrink-0 place-items-center rounded-md border border-edge bg-surface2 font-pixel text-base leading-none text-muted"
                    >
                      ≡
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-accent2">
                        Ambil &ldquo;{q.trim()}&rdquo; dari GameFAQs
                      </span>
                      <span className="block text-xs text-muted">
                        {faqKind === "native"
                          ? "Di HP — FAQ walkthrough terbaik diambil otomatis di dalam app."
                          : "Otomatis lewat server lokal — tanpa copy-paste."}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-muted">
                      →
                    </span>
                  </button>
                )}
              </>
            ) : (
              <div className="px-3.5 py-3">
                <div className="text-xs text-muted">
                  Platform yang kamu mainkan?{" "}
                  <span className="text-muted/70">
                    Kalau wiki punya panduan khusus versi itu, itu yang
                    diambil.
                  </span>
                </div>
                <div className="mt-3">
                  <PlatformChips onPick={openFromWiki} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
