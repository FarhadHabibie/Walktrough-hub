"use client";

import { useEffect, useState } from "react";
import DeleteGameButton from "@/components/DeleteGameButton";
import GameHeader from "@/components/GameHeader";
import SectionHead from "@/components/SectionHead";
import SidebarNav from "@/components/SidebarNav";
import { ProgressProvider } from "@/components/progress";
import { getGameBySlug, getSectionsForGame, subscribeStore } from "@/lib/store";
import { ensureFaqGame } from "@/lib/faq/import";
import { deriveTitleFromSlug, ensureGame } from "@/lib/wiki/ingest";
import type { Game, SectionMeta, SectionRow } from "@/lib/types";

type LoadState =
  | { status: "loading" }
  | { status: "ingesting" }
  | { status: "ready"; game: Game; sections: SectionRow[] }
  | { status: "missing" };

export default function GameView({
  slug,
  titleHint,
  platformHint,
  faq = false,
}: {
  slug: string;
  titleHint?: string;
  platformHint?: string;
  /** First open should fetch a GameFAQs FAQ instead of a wiki entry. */
  faq?: boolean;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await getGameBySlug(slug);
      if (existing) {
        const sections = await getSectionsForGame(slug);
        if (alive) setState({ status: "ready", game: existing, sections });
        return;
      }
      if (alive) setState({ status: "ingesting" });
      const game = faq
        ? await ensureFaqGame(slug, titleHint)
        : await ensureGame(slug, titleHint, platformHint);
      if (!alive) return;
      if (!game) {
        setState({ status: "missing" });
        return;
      }
      const sections = await getSectionsForGame(slug);
      if (alive) setState({ status: "ready", game, sections });
    })().catch(() => {
      if (alive) setState({ status: "missing" });
    });
    return () => {
      alive = false;
    };
  }, [slug, titleHint, platformHint, faq]);

  useEffect(() => {
    // Keep the header (platform picker, counts) in sync with the store —
    // e.g. right after the platform is changed from the picker.
    let alive = true;
    const unsubscribe = subscribeStore(() => {
      void getGameBySlug(slug).then((g) => {
        if (!alive || !g) return;
        setState((prev) =>
          prev.status === "ready" ? { ...prev, game: g } : prev,
        );
      });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [slug]);

  useEffect(() => {
    if (state.status === "ready") {
      document.title = `${state.game.title} — Walkthrough lengkap · WalkthroughHub`;
    } else if (state.status === "missing") {
      document.title = "Game tidak ditemukan · WalkthroughHub";
    } else {
      const guess = deriveTitleFromSlug(slug);
      document.title =
        state.status === "ingesting"
          ? `${guess} — mengambil walkthrough… · WalkthroughHub`
          : `${guess} — memuat… · WalkthroughHub`;
    }
  }, [state, slug]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto grid max-w-2xl place-items-center px-4 py-28 text-center">
        <div className="w-full max-w-sm rounded-xl border-2 border-edge bg-surface p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            Memuat<span className="blink text-accent">▮</span>
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "ingesting") {
    return (
      <div className="mx-auto grid max-w-2xl place-items-center px-4 py-28 text-center">
        <div className="w-full max-w-md rounded-xl border-2 border-edge bg-surface p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
            {faq ? "Mencari di GameFAQs" : "Menghubungi wiki publik"}
            <span className="blink text-accent">▮</span>
          </p>
          <h1 className="mt-5 font-pixel text-lg leading-snug sm:text-xl">
            Mengambil walkthrough{" "}
            <span className="text-accent">
              &ldquo;{deriveTitleFromSlug(slug)}&rdquo;
            </span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {faq ? (
              <>
                Dari GameFAQs — biasanya 3&ndash;15 detik; FAQ paling lengkap
                dipilih otomatis. Di HP, kalau perlu, halaman GameFAQs terbuka
                sebentar di dalam app.
              </>
            ) : (
              <>Dari wiki publik — biasanya 5&ndash;15 detik dan hanya sekali.</>
            )}{" "}
            Setelah tersimpan, halaman ini terbuka instan (bahkan tanpa
            internet).
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="mx-auto grid max-w-2xl place-items-center px-4 py-28 text-center">
        <div className="w-full max-w-lg rounded-xl border-2 border-edge bg-surface p-10">
          <div className="glow-accent font-pixel text-5xl font-bold text-accent/90">
            404
          </div>
          <h1 className="mt-4 font-pixel text-xl leading-snug">
            Game tidak ditemukan
          </h1>
          <p className="mt-3 text-sm text-muted">
            {faq ? (
              <>
                Tidak ada FAQ yang bisa diambil dari GameFAQs untuk game ini.
                Coba tulis nama game yang lebih lengkap di pencarian (mis.
                &ldquo;Hollow Knight&rdquo;) atau pilih sumber lain.
              </>
            ) : (
              <>
                Walkthrough yang kamu cari tidak ada di katalog dan tidak
                ditemukan di wiki publik. Coba tulis nama game yang lebih
                lengkap di pencarian (mis. &ldquo;Hollow Knight&rdquo;), lalu
                pilih <span className="text-ink">Ambil dari wiki publik</span>.
              </>
            )}
          </p>
          <a
            href="#/"
            className="pixel-shadow mt-7 inline-block rounded-lg border-2 border-accent bg-accent px-5 py-2.5 font-pixel text-xs font-bold uppercase text-bg transition-colors hover:border-accent2 hover:bg-accent2"
          >
            Lihat semua game
          </a>
        </div>
      </div>
    );
  }

  const { game, sections } = state;
  const isFaqSource = game.wiki_name === "gamefaqs.gamespot.com";
  const meta: SectionMeta[] = sections.map((s) => ({
    id: s.id,
    ord: s.ord,
    group_title: s.group_title,
    level: s.level,
    title: s.title,
    anchor: s.anchor,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 pt-6">
        <a
          href="#/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
        >
          <span aria-hidden>←</span> Semua game
        </a>
        <DeleteGameButton slug={game.slug} title={game.title} variant="page" />
      </div>

      <div className="pt-6">
        <ProgressProvider slug={game.slug} sections={meta}>
          <GameHeader game={game} />

          <div className="lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
            <SidebarNav sections={meta} />

            <article className="min-w-0 pb-24">
              {sections.map((s, i) => {
                const showGroup =
                  Boolean(s.group_title) &&
                  s.group_title !== (sections[i - 1]?.group_title ?? null);
                return (
                  <div key={s.id}>
                    {showGroup && (
                      <h2
                        className={`mb-6 text-lg font-semibold tracking-tight ${
                          i > 0 ? "mt-12 border-t border-edge pt-6" : "mt-2"
                        }`}
                      >
                        {s.group_title}
                      </h2>
                    )}
                    <section
                      id={s.anchor}
                      className="mb-12 scroll-mt-24 border-b border-edge/60 pb-12 last:mb-0 last:border-0 last:pb-0"
                    >
                      <SectionHead index={i} title={s.title} anchor={s.anchor} />
                      <div
                        className="prose-wt"
                        dangerouslySetInnerHTML={{ __html: s.content_html }}
                      />
                    </section>
                  </div>
                );
              })}

              <div className="mt-4 rounded-xl border border-edge bg-surface p-5 text-sm leading-relaxed text-muted">
                <div className="font-medium text-ink">Sumber & lisensi</div>
                <p className="mt-1.5">
                  {isFaqSource ? (
                    <>
                      Walkthrough ini diambil dari{" "}
                      {game.source_url ? (
                        <a
                          href={game.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent2 hover:underline"
                        >
                          GameFAQs
                        </a>
                      ) : (
                        "GameFAQs"
                      )}{" "}
                      — FAQ karya penulis aslinya di sana, disimpan untuk
                      bacaan pribadi. Buka halaman aslinya untuk versi terbaru,
                      gambar, dan pembahasan komunitas.
                    </>
                  ) : (
                    <>
                      Walkthrough ini diambil dari{" "}
                      {game.source_url ? (
                        <a
                          href={game.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent2 hover:underline"
                        >
                          {game.wiki_name ?? "wiki sumber"}
                        </a>
                      ) : (
                        (game.wiki_name ?? "wiki sumber")
                      )}{" "}
                      dan dilisensikan CC BY-SA. Kunjungi wiki aslinya untuk
                      referensi, gambar, dan pembahasan komunitas.
                    </>
                  )}
                </p>
              </div>
            </article>
          </div>
        </ProgressProvider>
      </div>
    </div>
  );
}
