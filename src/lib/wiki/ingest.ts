/**
 * On-demand walkthrough ingestion.
 *
 * Called by the game page when a slug is not in the database yet: discovers
 * the best public wiki for the game, scrapes + cleans the walkthrough, and
 * stores it in SQLite so the next visit is instant.
 *
 * In-flight requests for the same slug share one promise, and failures are
 * negatively cached for a short while so a typo'd URL doesn't hammer wikis
 * on every reload.
 */
import { getGameBySlug, rebuildFts, replaceSections, upsertGame } from "@/lib/db";
import type { Game } from "@/lib/types";
import { makeWikiClient } from "./mediawiki.ts";
import {
  DEFAULT_SKIP_PATTERN,
  cleanAndSplit,
  type CleanSection,
} from "./htmlclean.ts";
import { findBestWiki, findWalkthroughTarget } from "./discover.ts";

const NEGATIVE_TTL_MS = 10 * 60 * 1000;

const negative = new Map<string, number>();
const inflight = new Map<string, Promise<Game | null>>();

const SMALL_WORDS = new Set(["of", "the", "and", "in", "a", "an", "to", "vs"]);

/** "hollow-knight" → "Hollow Knight". Used when no title hint is provided. */
export function deriveTitleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) =>
      SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

async function runIngest(slug: string, titleHint?: string): Promise<Game | null> {
  const hint = titleHint?.trim() ?? "";
  const title = hint.length >= 2 ? hint : deriveTitleFromSlug(slug);
  if (title.length < 2) return null;

  const wiki = await findBestWiki(title);
  if (!wiki) {
    negative.set(slug, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  const client = makeWikiClient(wiki.api);
  const target = await findWalkthroughTarget(client, wiki.matchedTitle);
  if (!target) {
    negative.set(slug, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  const sections: CleanSection[] = [];
  for (const page of target.pages) {
    try {
      const parsed = await client.fetchPage(page);
      sections.push(
        ...cleanAndSplit(parsed.html, {
          origin: client.origin,
          pageUrl: parsed.sourceUrl,
          group: null,
          skipPattern: DEFAULT_SKIP_PATTERN,
          fallbackTitle: parsed.title,
        }),
      );
    } catch {
      // try the next page in the list, if any
    }
  }

  if (sections.length === 0) {
    negative.set(slug, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  // Cover: prefer the game's own article page (a hub page like "Main Jobs"
  // carries an unrelated image), then the walkthrough page, then the first
  // image inside the cleaned sections.
  let cover = await client.fetchCover(wiki.matchedTitle);
  if (!cover) cover = await client.fetchCover(target.pages[0]);
  if (!cover && sections[0]) {
    const m = /<img[^>]+src="([^"]+)"/i.exec(sections[0].html);
    cover = m?.[1] ?? null;
  }
  const displayTitle =
    wiki.matchedTitle.trim().length >= 2 ? wiki.matchedTitle : title;
  const sourceUrl = `${client.origin}/wiki/${encodeURIComponent(
    target.pages[0].replace(/ /g, "_"),
  )}`;

  const gameId = upsertGame({
    slug,
    title: displayTitle,
    platform: "",
    year: null,
    coverUrl: cover,
    description:
      target.kind === "walkthrough"
        ? `Walkthrough dari ${wiki.wikiName}, diambil otomatis dari halaman “${target.matchedTitle}”.`
        : `Panduan dari ${wiki.wikiName} (wiki ini belum punya halaman walkthrough khusus), diambil otomatis dari artikel “${target.matchedTitle}”.`,
    wikiName: wiki.wikiName,
    sourceUrl,
  });
  replaceSections(gameId, sections);
  rebuildFts();

  return getGameBySlug(slug);
}

/**
 * Return the game for `slug`, ingesting it from a public wiki on first
 * request. Resolves to null when no wiki/page could be found.
 */
export function ensureGame(slug: string, titleHint?: string): Promise<Game | null> {
  const existing = getGameBySlug(slug);
  if (existing) return Promise.resolve(existing);

  const until = negative.get(slug);
  if (until && Date.now() < until) return Promise.resolve(null);

  const running = inflight.get(slug);
  if (running) return running;

  const task = runIngest(slug, titleHint)
    .catch(() => {
      negative.set(slug, Date.now() + NEGATIVE_TTL_MS);
      return null;
    })
    .finally(() => {
      inflight.delete(slug);
    });
  inflight.set(slug, task);
  return task;
}
