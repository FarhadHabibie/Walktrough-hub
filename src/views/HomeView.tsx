"use client";

import { useEffect, useState } from "react";
import GameCard from "@/components/GameCard";
import SearchBox from "@/components/SearchBox";
import { listGames, subscribeStore } from "@/lib/store";
import type { Game } from "@/lib/types";

export default function HomeView() {
  const [games, setGames] = useState<Game[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void listGames().then((list) => {
        if (alive) setGames(list);
      });
    };
    load();
    const unsubscribe = subscribeStore(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const totalSections = (games ?? []).reduce(
    (n, g) => n + g.section_count,
    0,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="pb-12 pt-10 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-md border border-edge bg-surface px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {games === null
            ? "memuat katalog…"
            : `${games.length} game · ${totalSections.toLocaleString("id-ID")} bagian walkthrough`}
        </span>
        <h1 className="mt-5 max-w-3xl font-pixel text-[1.55rem] font-bold leading-[1.35] sm:text-[2rem] sm:leading-[1.3]">
          Semua walkthrough game,{" "}
          <span className="text-accent">dalam satu halaman</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          Cari game, buka walkthrough-nya yang lengkap dari awal sampai tamat —
          langsung dimuat semua, tanpa klik-klik chapter dan tanpa iklan. Progres
          baca otomatis tersimpan. Game belum ada di katalog? Ketik namanya,
          lalu pilih <span className="text-ink">“Ambil dari wiki publik”</span> —
          walkthrough-nya diambil otomatis dan langsung ditampilkan.
        </p>
        <div className="mt-6">
          <SearchBox autoFocus />
        </div>
      </section>

      <section id="games" className="scroll-mt-24 pb-20">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-pixel text-lg tracking-normal sm:text-xl">
              Katalog game
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Konten dari wiki publik, semuanya langsung terbuka di sini.
            </p>
          </div>
          <span className="font-mono text-xs text-muted">
            {games === null ? "…" : `${games.length} game`}
          </span>
        </div>

        {games === null ? (
          <div className="rounded-xl border-2 border-edge bg-surface p-8 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
              Memuat katalog<span className="blink text-accent">▮</span>
            </p>
          </div>
        ) : games.length === 0 ? (
          <div className="rounded-xl border-2 border-edge bg-surface p-8 text-center">
            <p className="text-sm text-muted">
              Belum ada game di katalog. Ketik nama game di kotak pencarian di
              atas, lalu pilih &ldquo;Ambil dari wiki publik&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {games.map((game) => (
              <GameCard key={game.slug} game={game} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
