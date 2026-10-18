/**
 * On-demand walkthrough ingestion.
 *
 * Called by the game page when a slug is not in the database yet: discovers
 * the most complete public source for the game, scrapes + cleans it, and
 * stores it in IndexedDB so the next visit is instant.
 *
 * Several sources can carry content for the same game, so they are all
 * collected (in parallel where possible) and then compared:
 *
 *  1. The primary wiki from discovery (Fandom / wiki.gg / ...): a dedicated
 *     walkthrough page when there is one — plus, when that pick is thin, the
 *     wiki's own game article, so that a bare "Quests" listing cannot hide a
 *     full article behind it.
 *  2. Fextralife's standardized "Game Progress Route", when the game has a
 *     wiki there.
 *  3. StrategyWiki's "<Game>/Table of Contents" multi-page guide, when the
 *     guide is substantial enough.
 *
 * The most complete candidate wins: the largest real walkthrough; when none
 * of them is substantial, the largest page of any kind.
 *
 * In-flight requests for the same slug share one promise, and failures are
 * negatively cached for a short while so a typo'd URL doesn't hammer wikis
 * on every reload.
 */
import { getGameBySlug, replaceSections, upsertGame } from "@/lib/store";
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
  type AltWalkthrough,
  type WalkthroughTarget,
  type WikiHit,
} from "./discover.ts";

const NEGATIVE_TTL_MS = 10 * 60 * 1000;

/** A walkthrough needs at least this much text before it can outrank an
 *  overview article in the source comparison — and before it counts as a
 *  "real" walkthrough at all. */
const MIN_SOLID_TEXT_CHARS = 4_000;
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

/* ------------------------------------------------------------------ *
 * Source candidates
 * ------------------------------------------------------------------ */

/** Where a candidate came from; "primary" is the wiki-discovery pick. */
type CandidateSource =
  | "primary"
  | "primary-article"
  | "fextralife"
  | "strategywiki";

type Candidate = {
  source: CandidateSource;
  wiki: WikiHit;
  client: WikiClient;
  target: WalkthroughTarget;
  sections: CleanSection[];
};

function toCandidate(
  source: CandidateSource,
  wiki: WikiHit,
  client: WikiClient,
  target: WalkthroughTarget,
  sections: CleanSection[],
): Candidate | null {
  return sections.length > 0 ? { source, wiki, client, target, sections } : null;
}

/** Fetch one secondary source (Fextralife / StrategyWiki) into a candidate. */
async function altCandidate(
  source: CandidateSource,
  find: () => Promise<AltWalkthrough | null>,
): Promise<Candidate | null> {
  const alt = await find();
  if (!alt) return null;
  const client = makeWikiClient(alt.hit.api);
  const sections = await fetchSections(client, alt.target);
  return toCandidate(source, alt.hit, client, alt.target, sections);
}

async function runIngest(
  slug: string,
  titleHint?: string,
  platformHint?: string,
): Promise<Game | null> {
  const hint = titleHint?.trim() ?? "";
  const title = hint.length >= 2 ? hint : deriveTitleFromSlug(slug);
  if (title.length < 2) return null;
  const platform = platformHint?.trim() ? platformHint.trim() : null;

  // Phase 1 — the primary wiki network (Fandom, wiki.gg, ...).
  const wiki = await findBestWiki(title);
  const primaryClient = wiki ? makeWikiClient(wiki.api) : null;
  const primaryTarget =
    wiki && primaryClient
      ? await findWalkthroughTarget(primaryClient, wiki.matchedTitle)
      : null;
  const primarySections =
    primaryClient && primaryTarget
      ? await fetchSections(primaryClient, primaryTarget)
      : [];
  const primaryChars = totalText(primarySections);
  const primarySolid =
    primaryTarget?.kind === "walkthrough" &&
    primaryChars >= MIN_SOLID_TEXT_CHARS;

  // Phase 2 — every other source, in parallel. The primary wiki's own game
  // article only joins when the walkthrough-ish pick there is thin: a solid
  // walkthrough always beats an overview article, so it could never win.
  const jobs: Array<Promise<Candidate | null>> = [];
  if (
    wiki &&
    primaryClient &&
    primaryTarget &&
    !primarySolid &&
    primaryTarget.matchedTitle !== wiki.matchedTitle
  ) {
    const article: WalkthroughTarget = {
      pages: [wiki.matchedTitle],
      matchedTitle: wiki.matchedTitle,
      kind: "article",
    };
    jobs.push(
      fetchSections(primaryClient, article).then((sections) =>
        toCandidate("primary-article", wiki, primaryClient, article, sections),
      ),
    );
  }
  jobs.push(altCandidate("fextralife", () => findFextralifeTarget(title)));
  jobs.push(
    altCandidate("strategywiki", () => findStrategyWikiTarget(title, platform)),
  );
  const settled = await Promise.allSettled(jobs);

  const candidates: Candidate[] = [];
  if (wiki && primaryClient && primaryTarget) {
    const primary = toCandidate(
      "primary",
      wiki,
      primaryClient,
      primaryTarget,
      primarySections,
    );
    if (primary) candidates.push(primary);
  }
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      candidates.push(result.value);
    }
  }
  if (candidates.length === 0) {
    negative.set(slug, Date.now() + NEGATIVE_TTL_MS);
    return null;
  }

  // The most complete source wins: the largest solid walkthrough; when none
  // is substantial, the largest page of any kind. Ties keep the earlier
  // candidate (the primary wiki first).
  const solid = candidates.filter(
    (c) =>
      c.target.kind === "walkthrough" &&
      totalText(c.sections) >= MIN_SOLID_TEXT_CHARS,
  );
  const pool = solid.length > 0 ? solid : candidates;
  let winner = pool[0];
  for (const c of pool) {
    if (totalText(c.sections) > totalText(winner.sections)) winner = c;
  }

  const { wiki: chosenWiki, client: chosenClient, target, sections } = winner;

  // Cover: when a secondary source supplies the text, the primary wiki's
  // article still provides the box art — then, except on Fextralife (whose
  // pages only expose item icons and UI buttons), the winning wiki's article,
  // main page and walkthrough page; finally the first image inside the
  // cleaned sections.
  const coverFallback =
    (winner.source === "fextralife" || winner.source === "strategywiki") &&
    wiki &&
    primaryClient
      ? { client: primaryClient, page: wiki.matchedTitle }
      : null;
  const isFextralife = chosenWiki.wikiName.endsWith("wiki.fextralife.com");
  let cover: string | null = null;
  if (coverFallback) {
    cover = await coverFallback.client.fetchCover(coverFallback.page);
  }
  if (!cover && !isFextralife) {
    cover = await chosenClient.fetchCover(chosenWiki.matchedTitle);
    if (!cover) {
      const main = await chosenClient.mainPage();
      if (main && main !== chosenWiki.matchedTitle) {
        cover = await chosenClient.fetchCover(main);
      }
    }
    if (!cover) cover = await chosenClient.fetchCover(target.pages[0]);
  }
  if (!cover && !isFextralife && sections[0]) {
    const m = /<img[^>]+src="([^"]+)"/i.exec(sections[0].html);
    cover = m?.[1] ?? null;
  }
  // Fextralife pages end with " Wiki" ("Elden Ring Wiki") — trim for display.
  const cleanedTitle = chosenWiki.matchedTitle.replace(/\s*wiki$/i, "").trim();
  const displayTitle = cleanedTitle.length >= 2 ? cleanedTitle : title;
  const sourcePage = target.sourcePage ?? target.pages[0];
  const sourceUrl = `${chosenClient.origin}/wiki/${encodeURIComponent(
    sourcePage.replace(/ /g, "_"),
  )}`;

  await upsertGame({
    slug,
    title: displayTitle,
    platform,
    year: null,
    coverUrl: cover,
    description:
      target.kind === "walkthrough"
        ? `${target.pages.length > 1 ? "Panduan lengkap" : "Walkthrough"} dari ${chosenWiki.wikiName}, diambil otomatis dari halaman “${target.matchedTitle}”.`
        : `Panduan dari ${chosenWiki.wikiName} (wiki ini belum punya halaman walkthrough khusus), diambil otomatis dari artikel “${target.matchedTitle}”.`,
    wikiName: chosenWiki.wikiName,
    sourceUrl,
  });
  await replaceSections(slug, sections);

  return getGameBySlug(slug);
}

/**
 * Return the game for `slug`, ingesting it from a public wiki on first
 * request. `platformHint` labels the game and steers discovery towards a
 * platform-specific edition guide when the wiki has one. Resolves to null
 * when no wiki/page could be found.
 */
export async function ensureGame(
  slug: string,
  titleHint?: string,
  platformHint?: string,
): Promise<Game | null> {
  const existing = await getGameBySlug(slug);
  if (existing) return existing;

  const until = negative.get(slug);
  if (until && Date.now() < until) return Promise.resolve(null);

  const running = inflight.get(slug);
  if (running) return running;

  const task = runIngest(slug, titleHint, platformHint)
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
