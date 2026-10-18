import DeleteGameButton from "@/components/DeleteGameButton";
import type { Game } from "@/lib/types";

export default function GameCard({ game }: { game: Game }) {
  return (
    <a
      href={`#/games/${game.slug}`}
      className="group overflow-hidden rounded-xl border-2 border-edge bg-surface transition-[border-color,box-shadow] duration-150 hover:border-accent/70 hover:pixel-shadow-accent"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface2">
        {game.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.cover_url}
            alt={`Cover ${game.title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-surface2">
            <span className="font-pixel text-4xl text-muted/60">
              {game.title.charAt(0)}
            </span>
          </div>
        )}
        <DeleteGameButton slug={game.slug} title={game.title} variant="card" />
      </div>
      <div className="p-3.5">
        <div className="line-clamp-2 min-h-10 text-sm font-semibold leading-snug tracking-tight text-ink">
          {game.title}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-muted">
          <span className="truncate font-mono text-[10px] uppercase tracking-wide">
            {[game.year || null, game.platform].filter(Boolean).join(" · ")}
          </span>
          <span className="shrink-0 font-mono text-[10px]">
            {game.section_count} bagian
          </span>
        </div>
      </div>
    </a>
  );
}
