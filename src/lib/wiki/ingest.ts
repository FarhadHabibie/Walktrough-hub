/**
 * On-demand walkthrough ingestion.
 *
 * Called by the game page when a slug is not in the database yet: discovers
 * the best public source for the game, scrapes + cleans the walkthrough, and
 * stores it in SQLite so the next visit is instant.
 *
 * Sources: primary wiki discovery (Fandom / wiki.gg / ...) first; when that
 * only yields a general article, a stub, or nothing, the walkthrough-first
 * sources kick in (Fextralife "Game Progress Route", StrategyWiki guides).
 *
 * In-flight requests for the same slug share one promise, and failures are
 * negatively cached for a short while so a typo'd URL doesn't hammer wikis
 * on every reload.
 */
import { getGameBySlug, rebuildFts, replaceSections, upsertGame } from "@/lib/db";
import type { Game } from "@/lib/types";
import { makeWikiClient, type WikiClient } from "./mediawiki.ts";
import {
  DEFAULT_SKIP_PATTERN,
  cleanAndSplit,
  type CleanSection,
} from "./htmlclean.ts";
import {
  findBestWiki,
  findFextralifeTarget,
  findStrategyWikiTarget,
  findWalkthroughTarget,
  type WalkthroughTarget,
} from "./discover.ts";

const NEGATIVE_TTL_MS = 10 * 60 * 1000;

/** A walkthrough page needs at least this much text before we skip the
 *  secondary walkthrough sources entirely. */
const SOLID_TEXT_CHARS = 12_000;
/** A secondary source only replaces a primary result once it carries real
 *  content on its own. */
const MIN_ALT_TEXT_CHARS = 4_000;
/** Pages fetched in parallel for multi-page guides. */
const FETCH_CONCURRENCY = 6;

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

function totalText(sections: CleanSection[]): number {
  return sections.reduce((n, s) => n + s.text.length, 0);
}

/** Fetch + clean every page of a target, keeping the pages' order. */
async function fetchSections(
  client: WikiClient,
  target: WalkthroughTarget,
): Promise<CleanSection[]> {
  const multiPage = target.pages.length > 1;
  const sections: CleanSection[] = [];
  for (let i = 0; i < target.pages.length; i += FETCH_CONCURRENCY) {
    const chunk = target.pages.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (page): Promise<CleanSection[]> => {
        try {
          const parsed = await client.fetchPage(page);
          return cleanAndSplit(parsed.html, {
            origin: client.origin,
            pageUrl: parsed.sourceUrl,
            group: multiPage ? parsed.title : null,
            splitLevels: target.splitLevels,
            skipPattern: DEFAULT_SKIP_PATTERN,
            fallbackTitle: parsed.title,
          });
        } catch {
          return [];
        }
      }),
    );
    for (const r of results) sections.push(...r);
  }
  return sections;
}

async function runIngest(slug: string, titleHint?: string): Promise<Game | null> {
  const hint = titleHint?.trim() ?? "";
  const title = hint.length >= 2 ? hint : deriveTitleFromSlug(slug);
  if (title.length < 2) return null;

  // Phase 1 — the primary wiki network (Fandom, wiki.gg, ...).
  let wiki = await findBestWiki(title);
  let client = wiki ? makeWikiClient(wiki.api) : null;
  let target: WalkthroughTarget | null = null;
  let sections: CleanSection[] = [];
  if (wiki && client) {
    target = await findWalkthroughTarget(client, wiki.matchedTitle);
    if (target) sections = await fetchSections(client, target);
  }

  const primaryKind = target?.kind ?? null;
  const primaryChars = totalText(sections);

  // Phase 2 — when the primary source only had an article, a stub page, or
  // nothing at all, try the walkthrough-first sources and keep whichever
  // result actually helps the reader most.
  let coverFallback: { client: WikiClient; page: string } | null = null;
  const skipAlts =
    sections.length > 0 &&
    primaryKind === "walkthrough" &&
    primaryChars >= SOLID_TEXT_CHARS;
  if (!skipAlts) {
    const alt =
      (await findFextralifeTarget(title)) ??
      (await findStrategyWikiTarget(title));
    if (alt) {
      const altClient = makeWikiClient(alt.hit.api);
      const altSections = await fetchSections(altClient, alt.target);
      const altChars = totalText(altSections);
      const havePrimary = sections.length > 0;
      const preferAlt =
        altSections.length > 0 &&
        (!havePrimary ||
          (primaryKind === "article" && altChars >= MIN_ALT_TEXT_CHARS) ||
          (primaryKind === "walkthrough" && altChars > primaryChars * 1.2));
      if (preferAlt) {
        // Keep the primary wiki's page around: Fandom box art beats anything
        // the secondary source can offer as a cover.
        if (wiki && client) coverFallback = { client, page: wiki.matchedTitle };
        wiki = alt.hit;
        client = altClient;
        target = alt.target;
        sections = altSections;
      }
    }
  }

  if (!wiki || !client || !target || sections.length === 0) {
    negative.set(slug, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  // Cover: prefer the game article on the primary wiki, then — except on
  // Fextralife, whose pages only expose item icons and UI buttons — the
  // source wiki's article, main page and walkthrough page; finally the first
  // image inside the cleaned sections.
  const isFextralife = wiki.wikiName.endsWith("wiki.fextralife.com");
  let cover: string | null = null;
  if (coverFallback) {
    cover = await coverFallback.client.fetchCover(coverFallback.page);
  }
  if (!cover && !isFextralife) {
    cover = await client.fetchCover(wiki.matchedTitle);
    if (!cover) {
      const main = await client.mainPage();
      if (main && main !== wiki.matchedTitle) {
        cover = await client.fetchCover(main);
      }
    }
    if (!cover) cover = await client.fetchCover(target.pages[0]);
  }
  if (!cover && !isFextralife && sections[0]) {
    const m = /<img[^>]+src="([^"]+)"/i.exec(sections[0].html);
    cover = m?.[1] ?? null;
  }
  // Fextralife pages end with " Wiki" ("Elden Ring Wiki") — trim for display.
  const cleanedTitle = wiki.matchedTitle.replace(/\s*wiki$/i, "").trim();
  const displayTitle = cleanedTitle.length >= 2 ? cleanedTitle : title;
  const sourcePage = target.sourcePage ?? target.pages[0];
  const sourceUrl = `${client.origin}/wiki/${encodeURIComponent(
    sourcePage.replace(/ /g, "_"),
  )}`;

  const gameId = upsertGame({
    slug,
    title: displayTitle,
    platform: "",
    year: null,
    coverUrl: cover,
    description:
      target.kind === "walkthrough"
        ? `${target.pages.length > 1 ? "Panduan lengkap" : "Walkthrough"} dari ${wiki.wikiName}, diambil otomatis dari halaman “${target.matchedTitle}”.`
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
