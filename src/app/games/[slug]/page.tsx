import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GameHeader from "@/components/GameHeader";
import SectionHead from "@/components/SectionHead";
import SidebarNav from "@/components/SidebarNav";
import { ProgressProvider } from "@/components/progress";
import { getGameBySlug, getSectionsForGame } from "@/lib/db";
import type { SectionMeta } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();
  return {
    title: `${game.title} — Walkthrough lengkap`,
    description:
      game.description ??
      `Walkthrough lengkap ${game.title}: ${game.section_count} bagian dari ${game.wiki_name ?? "wiki publik"}.`,
  };
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game) notFound();

  const sections = getSectionsForGame(game.id);
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
      <div className="pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
        >
          <span aria-hidden>←</span> Semua game
        </Link>
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
                      <h2 className="mb-6 mt-2 border-l-2 border-accent pl-3 font-mono text-sm uppercase tracking-[0.15em] text-accent">
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

              <div className="mt-4 rounded-2xl border border-edge bg-surface p-5 text-sm leading-relaxed text-muted">
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
