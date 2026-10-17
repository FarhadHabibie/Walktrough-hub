"use client";

import { useEffect, useState } from "react";
import DeleteGameButton from "@/components/DeleteGameButton";
import GameHeader from "@/components/GameHeader";
import SectionHead from "@/components/SectionHead";
import SidebarNav from "@/components/SidebarNav";
import { ProgressProvider } from "@/components/progress";
import { getGameBySlug, getSectionsForGame } from "@/lib/store";
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
}: {
  slug: string;
  titleHint?: string;
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
      const game = await ensureGame(slug, titleHint);
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
  }, [slug, titleHint]);

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
        <div className="rounded-xl border border-edge bg-surface p-10">
          <span className="mx-auto block size-6 animate-spin rounded-full border-2 border-edge border-t-accent" />
          <p className="mt-4 text-sm text-muted">Memuat…</p>
        </div>
      </div>
    );
  }

  if (state.status === "ingesting") {
    return (
      <div className="mx-auto grid max-w-2xl place-items-center px-4 py-28 text-center">
        <div className="rounded-xl border border-edge bg-surface p-10">
          <span className="mx-auto block size-6 animate-spin rounded-full border-2 border-edge border-t-accent" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight">
            Mengambil walkthrough{" "}
            <span className="text-accent">
              &ldquo;{deriveTitleFromSlug(slug)}&rdquo;
            </span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Dari wiki publik — biasanya 5&ndash;15 detik dan hanya sekali.
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
        <div className="rounded-xl border border-edge bg-surface p-10">
          <div className="font-mono text-4xl font-bold text-muted">404</div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Game tidak ditemukan
          </h1>
          <p className="mt-3 text-sm text-muted">
            Walkthrough yang kamu cari tidak ada di katalog dan tidak ditemukan
            di wiki publik. Coba tulis nama game yang lebih lengkap di pencarian
            (mis. &ldquo;Hollow Knight&rdquo;), lalu pilih{" "}
            <span className="text-ink">Ambil dari wiki publik</span>.
          </p>
          <a
            href="#/"
            className="mt-7 inline-block rounded-lg border border-accent/50 bg-accent/15 px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/25"
          >
            Lihat semua game
          </a>
        </div>
      </div>
    );
  }

  const { game, sections } = state;
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
                </p>
              </div>
            </article>
          </div>
        </ProgressProvider>
      </div>
    </div>
  );
}
