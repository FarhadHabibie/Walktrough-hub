import Image from "next/image";
import Link from "next/link";
import DeleteGameButton from "@/components/DeleteGameButton";
import type { Game } from "@/lib/types";

export default function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group overflow-hidden rounded-2xl border border-edge bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-xl hover:shadow-accent/5"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface2">
        {game.cover_url ? (
          <Image
            src={`/api/cover/${game.slug}`}
            alt={`Cover ${game.title}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-surface2 via-surface to-surface2">
            <span className="font-mono text-4xl font-bold text-muted/60">
              {game.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="absolute bottom-2.5 left-2.5 rounded-full border border-edge/60 bg-bg/80 px-2.5 py-0.5 font-mono text-[11px] text-ink/90 backdrop-blur">
          {game.section_count} bagian
        </span>
        <DeleteGameButton slug={game.slug} title={game.title} variant="card" />
      </div>
      <div className="p-3.5">
        <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug tracking-tight text-ink">
          {game.title}
        </div>
        <div className="mt-1.5 truncate text-xs text-muted">
          {[game.year || null, game.platform].filter(Boolean).join(" · ")}
        </div>
      </div>
    </Link>
  );
}
