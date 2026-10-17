import GameCard from "@/components/GameCard";
import SearchBox from "@/components/SearchBox";
import { listGames } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const games = listGames();
  const totalSections = games.reduce((n, g) => n + g.section_count, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="pb-14 pt-16 sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted">
          <span className="size-1.5 rounded-full bg-ok" />
          {games.length} game · {totalSections.toLocaleString("id-ID")} bagian
          walkthrough
        </span>
        <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl">
          Semua walkthrough game,{" "}
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
            dalam satu halaman
          </span>
          .
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted">
          Cari game, buka walkthrough-nya yang lengkap dari awal sampai tamat —
          langsung dimuat semua, tanpa klik-klik chapter dan tanpa iklan. Progres
          baca otomatis tersimpan.
        </p>
        <div className="mt-8">
          <SearchBox autoFocus />
        </div>
      </section>

      <section id="games" className="scroll-mt-24 pb-24">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Katalog game
            </h2>
            <p className="mt-1 text-sm text-muted">
              Konten dari wiki publik, siap dibaca offline-style di sini.
            </p>
          </div>
          <span className="font-mono text-xs text-muted">
            {games.length} game
          </span>
        </div>

        {games.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-edge bg-surface p-10 text-center">
            <p className="text-sm text-muted">
              Belum ada game di database. Jalankan{" "}
              <code className="rounded-md border border-edge bg-surface2 px-2 py-1 font-mono text-xs text-ink">
                npm run seed
              </code>{" "}
              untuk mengisi walkthrough dari wiki publik.
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
