/**
 * Wiki discovery for on-demand walkthrough ingestion.
 *
 * There is no reliable cross-wiki search API in public use (Fandom's is
 * Cloudflare-gated), so we generate candidate wikis from the game title —
 * a curated map for popular games plus name-based domain guesses — then
 * probe each one live and score how well its search results match.
 */
import { makeWikiClient, type WikiClient } from "./mediawiki.ts";

export type WikiHit = {
  api: string;
  origin: string;
  wikiName: string;
  score: number;
  /** Best-matching page title on that wiki (used as canonical game title). */
  matchedTitle: string;
};

/**
 * Curated wiki hosts for popular games. First match wins, entries ordered by
 * specificity. `api` must point at the wiki's api.php.
 */
const CURATED: Array<[RegExp, string]> = [
  [/hollow\s*knight/i, "https://hollowknight.fandom.com/api.php"],
  [/cyberpunk/i, "https://cyberpunk.fandom.com/api.php"],
  [/stardew/i, "https://stardewvalleywiki.com/mediawiki/api.php"],
  [/^(grand\s*theft|gta\b|gta\s)/i, "https://gta.fandom.com/api.php"],
  [/zelda/i, "https://zelda.fandom.com/api.php"],
  [/^(pokemon|pokémon)/i, "https://bulbapedia.bulbagarden.net/api.php"],
  [/elder\s*scrolls|skyrim|morrowind|oblivion/i, "https://elderscrolls.fandom.com/api.php"],
  [/mass\s*effect/i, "https://masseffect.fandom.com/api.php"],
  [/dark\s*souls/i, "https://darksouls.fandom.com/api.php"],
  [/sekiro/i, "https://sekiroshadowsdietwice.fandom.com/api.php"],
  [/bloodborne/i, "https://bloodborne.fandom.com/api.php"],
  [/baldur|bg3/i, "https://baldursgate3.fandom.com/api.php"],
  [/fallout/i, "https://fallout.fandom.com/api.php"],
  [/^resident\s*evil/i, "https://residentevil.fandom.com/api.php"],
  [/silent\s*hill/i, "https://silenthill.fandom.com/api.php"],
  [/^halo\b/i, "https://halo.fandom.com/api.php"],
  [/call\s*of\s*duty/i, "https://callofduty.fandom.com/api.php"],
  [/^diablo\b/i, "https://diablo.fandom.com/api.php"],
  [/god\s*of\s*war/i, "https://godofwar.fandom.com/api.php"],
  [/persona\b|megami\s*tensei/i, "https://megamitensei.fandom.com/api.php"],
  [/red\s*dead/i, "https://reddead.fandom.com/api.php"],
  [/witcher/i, "https://witcher.fandom.com/api.php"],
  [/elden\s*ring/i, "https://eldenring.fandom.com/api.php"],
  [/terraria/i, "https://terraria.wiki.gg/api.php"],
  [/minecraft/i, "https://minecraft.wiki/api.php"],
  [/don'?t\s*starve/i, "https://dontstarve.fandom.com/api.php"],
  [/binding\s*of\s*isaac/i, "https://bindingofisaacrebirth.fandom.com/api.php"],
  [/deep\s*rock\s*galactic/i, "https://deeprockgalactic.wiki.gg/api.php"],
];

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "in", "to", "vs"]);

function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Ordered candidate api.php URLs for a free-text game title. */
export function candidateApis(title: string): string[] {
  const out: string[] = [];
  const push = (api: string) => {
    if (!out.includes(api)) out.push(api);
  };

  for (const [re, api] of CURATED) if (re.test(title)) push(api);

  const words = normalizeForMatch(title)
    .split(" ")
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  const compact = words.join("");
  if (compact.length >= 3) {
    push(`https://${compact}.fandom.com/api.php`);
    push(`https://${compact}.wiki.gg/api.php`);
  }

  const noDigits = compact.replace(/[0-9]+/g, "");
  if (noDigits.length >= 3 && noDigits !== compact) {
    push(`https://${noDigits}.fandom.com/api.php`);
    push(`https://${noDigits}.wiki.gg/api.php`);
  }

  const first = words[0] ?? "";
  if (first.length >= 5 && first !== compact) {
    push(`https://${first}.fandom.com/api.php`);
  }

  if (words.length >= 2) {
    const acronym = words.map((w) => w[0]).join("");
    if (acronym.length >= 2 && acronym.length <= 5) {
      push(`https://${acronym}.fandom.com/api.php`);
    }
  }

  return out.slice(0, 9);
}

/** Run a promise but give up after `ms`, resolving to `fallback`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(fallback);
    });
  });
}

async function probeWiki(api: string, title: string): Promise<WikiHit | null> {
  let client: WikiClient;
  try {
    client = makeWikiClient(api);
  } catch {
    return null;
  }

  const wanted = normalizeForMatch(title);
  try {
    const [titles, exists] = await Promise.all([
      client.searchTitles(title, 8),
      client.pageExists(title),
    ]);
    if (titles.length === 0 && !exists) return null;

    let score = 0;
    let matched: string | null = null;
    for (let i = 0; i < titles.length; i++) {
      const t = titles[i];
      const norm = normalizeForMatch(t);
      let s = Math.max(0, 12 - i * 2);
      if (norm === wanted) s += 100;
      else if (norm.startsWith(wanted) || wanted.startsWith(norm)) s += 45;
      else if (norm.includes(wanted) || wanted.includes(norm)) s += 25;
      if (s > score) {
        score = s;
        matched = t;
      }
    }
    if (exists) score += 30;

    if (score <= 0) return null;
    return {
      api,
      origin: client.origin,
      wikiName: new URL(api).hostname,
      score,
      matchedTitle: matched ?? title,
    };
  } catch {
    return null;
  }
}

/** Probe all candidate wikis in parallel and return the best match. */
export async function findBestWiki(title: string): Promise<WikiHit | null> {
  const apis = candidateApis(title);
  if (apis.length === 0) return null;

  const probes = apis.map((api) =>
    withTimeout(probeWiki(api, title), 8_000, null),
  );
  const settled = await Promise.allSettled(probes);
  const hits = settled
    .filter(
      (p): p is PromiseFulfilledResult<WikiHit | null> =>
        p.status === "fulfilled",
    )
    .map((p) => p.value)
    .filter((h): h is WikiHit => h !== null)
    .sort((a, b) => b.score - a.score);

  return hits[0] ?? null;
}

export type WalkthroughTarget = {
  pages: string[];
  matchedTitle: string;
  /** "walkthrough" = a dedicated guide page; "article" = game overview fallback. */
  kind: "walkthrough" | "article";
  /** Heading levels to split sections at (default [1, 2]). Some sources put
   *  every walkthrough step in an <h3>. */
  splitLevels?: number[];
  /** Page to link as the source (defaults to pages[0]) — e.g. the game's
   *  guide root for multi-page guides. */
  sourcePage?: string;
};

/** Classic page names that usually hold a full game walkthrough, in priority
 *  order. MediaWiki titles are case-sensitive after the first letter, so
 *  common capitalizations are all listed. */
const WALKTHROUGH_PAGES = [
  "Walkthrough",
  "Walkthroughs",
  "Story walkthrough",
  "Gameplay walkthrough",
  "Strategy guide",
  "Guide",
  "Getting Started",
  "Getting started",
  "Beginner's Guide",
  "Beginner's guide",
  "Beginners guide",
  "Beginners' Guide",
  "Guide:Getting started",
  "Tutorials/Beginner's guide",
];

/**
 * Find the page(s) to ingest for a game. Priority:
 *   1. A game-specific subpage ("<Game>/Walkthrough", "<Game>/Guide").
 *   2. Classic walkthrough page names ("Walkthrough", "Guide", ...).
 *   3. A mission/quest hub for this game ("Missions in GTA San Andreas",
 *      "Cyberpunk 2077 Main Jobs") — verified to share a distinctive word
 *      with the game title, so generic pages like a bare "Quests" are skipped.
 *      When both (2) and (3) exist, the bigger page (wikitext bytes) wins —
 *      franchise wikis often keep a generic series-wide "Walkthrough" stub.
 *   4. The game's own article, as a last resort.
 */
export async function findWalkthroughTarget(
  client: WikiClient,
  fallbackTitle: string,
): Promise<WalkthroughTarget | null> {
  // 1) game-specific subpages
  try {
    const subs = [
      `${fallbackTitle}/Walkthrough`,
      `${fallbackTitle}/Guide`,
      `${fallbackTitle}/Walkthroughs`,
    ];
    const existing = await client.existingPages(subs);
    for (const c of subs) {
      if (existing.has(c)) {
        return { pages: [c], matchedTitle: c, kind: "walkthrough" };
      }
    }
  } catch {
    // continue
  }

  // 2) + 3) classic pages and game-specific mission/quest hub
  let classic: string | null = null;
  let hub: string | null = null;
  try {
    const [existing, missionHits] = await Promise.all([
      client.existingPages(WALKTHROUGH_PAGES),
      client.searchTitles(`${fallbackTitle} missions`, 8),
    ]);
    for (const c of WALKTHROUGH_PAGES) {
      if (existing.has(c)) {
        classic = c;
        break;
      }
    }
    hub = pickMissionHub(missionHits, fallbackTitle);
  } catch {
    // continue
  }

  if (classic && hub && classic === hub) return targetOf(hub);
  if (classic && hub) {
    try {
      const sizes = await client.pageSizes([classic, hub]);
      const classicSize = sizes.get(classic.toLowerCase()) ?? 0;
      const hubSize = sizes.get(hub.toLowerCase()) ?? 0;
      return targetOf(hubSize > classicSize ? hub : classic);
    } catch {
      return targetOf(classic);
    }
  }
  if (classic) return targetOf(classic);
  if (hub) return targetOf(hub);

  // 4) search-based guess
  try {
    const hits = await client.searchTitles("walkthrough", 12);
    const hit = hits.find(
      (t) =>
        /walkthrough/i.test(t) &&
        !/^(category|template|file|user|forum|board|help|talk):/i.test(t),
    );
    if (hit) return targetOf(hit);
  } catch {
    // fall through to the article fallback
  }

  if (fallbackTitle) {
    return { pages: [fallbackTitle], matchedTitle: fallbackTitle, kind: "article" };
  }
  return null;
}

function targetOf(page: string): WalkthroughTarget {
  return { pages: [page], matchedTitle: page, kind: "walkthrough" };
}

const MISSION_WORD = /\b(missions?|jobs?|quests?|chapters?|acts?)\b/i;

/** First search hit that is a mission/quest page for THIS game. */
function pickMissionHub(hits: string[], gameTitle: string): string | null {
  const wanted = new Set(
    normalizeForMatch(gameTitle)
      .split(" ")
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
  );
  if (wanted.size === 0) return null;
  for (const h of hits) {
    if (!MISSION_WORD.test(h)) continue;
    const shared = normalizeForMatch(h)
      .split(" ")
      .some((w) => wanted.has(w));
    if (shared) return h;
  }
  return null;
}

/* ------------------------------------------------------------------------- *
 * Secondary walkthrough sources
 *
 * When the Fandom / wiki.gg discovery above only turns up a general article
 * (or nothing), we look at two sources that are built around walkthroughs:
 *
 *  1. Fextralife wikis (<game>.wiki.fextralife.com) — every one of them
 *     carries a standardized "Game Progress Route" page: an ordered,
 *     area-by-area walkthrough. Their rendered pages split at <h3>.
 *  2. StrategyWiki (strategywiki.org) — one wiki for all games; complete
 *     guides follow the "<Game>/Table of Contents" + per-section subpage
 *     convention, so the TOC doubles as the reading order.
 * ------------------------------------------------------------------------- */

/** Known Fextralife subdomains for titles whose domain name isn't obvious. */
const FEXTRALIFE_CURATED: Array<[RegExp, string]> = [
  [/dark\s*souls\s*(iii|3)\b/i, "darksouls3"],
  [/dark\s*souls\s*(ii|2)\b/i, "darksouls2"],
  [/dark\s*souls(?!\s*(iii|3|ii|2)\b)/i, "darksouls"],
  [/demon'?s?\s*souls/i, "demonssouls"],
  [/elden\s*ring/i, "eldenring"],
  [/bloodborne/i, "bloodborne"],
  [/sekiro/i, "sekiroshadowsdietwice"],
  [/nioh\s*2/i, "nioh2"],
  [/nioh(?!\s*2\b)/i, "nioh"],
  [/baldur'?s?\s*gate\s*(iii|3)/i, "baldursgate3"],
  [/monster\s*hunter\s*world/i, "monsterhunterworld"],
];

function fextralifeSubdomains(title: string): string[] {
  const out: string[] = [];
  for (const [re, sub] of FEXTRALIFE_CURATED) {
    if (re.test(title) && !out.includes(sub)) out.push(sub);
  }
  const compact = normalizeForMatch(title)
    .split(" ")
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .join("");
  if (compact.length >= 3 && !out.includes(compact)) out.push(compact);
  return out.slice(0, 4);
}

/** Best-scoring search hit for a title, ignoring file/image redirects. */
function bestHit(hits: string[], title: string, minScore = 45): string | null {
  const wanted = normalizeForMatch(title);
  let best = 0;
  let matched: string | null = null;
  for (let i = 0; i < hits.length; i++) {
    const t = hits[i];
    if (/\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(t) || t.includes("/")) {
      continue;
    }
    const norm = normalizeForMatch(t);
    let s = Math.max(0, 12 - i * 2);
    if (norm === wanted) s += 100;
    else if (norm.startsWith(wanted) || wanted.startsWith(norm)) s += 45;
    else if (norm.includes(wanted) || wanted.includes(norm)) s += 25;
    if (s > best) {
      best = s;
      matched = t;
    }
  }
  return best >= minScore ? matched : null;
}

export type AltWalkthrough = { hit: WikiHit; target: WalkthroughTarget };

/** Fextralife: use the standardized "Game Progress Route" page, if the
 *  game has a wiki there. Returns null when no candidate host qualifies. */
export async function findFextralifeTarget(
  title: string,
): Promise<AltWalkthrough | null> {
  for (const sub of fextralifeSubdomains(title)) {
    try {
      const api = `https://${sub}.wiki.fextralife.com/api.php`;
      const client = makeWikiClient(api);
      const exists = await client.existingPages(["Game Progress Route"]);
      if (!exists.has("Game Progress Route")) continue;

      const page = bestHit(await client.searchTitles(title, 6), title);
      return {
        hit: {
          api,
          origin: client.origin,
          wikiName: new URL(api).hostname,
          score: 0,
          matchedTitle: page ?? title,
        },
        target: {
          pages: ["Game Progress Route"],
          matchedTitle: "Game Progress Route",
          kind: "walkthrough",
          splitLevels: [1, 2, 3],
        },
      };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const STRATEGYWIKI_API = "https://strategywiki.org/w/api.php";
const STRATEGYWIKI_MIN_PAGES = 10;
const STRATEGYWIKI_MAX_PAGES = 40;

/** Ordered "<Game>/..." links inside a StrategyWiki Table of Contents page. */
function extractSubpageLinks(html: string, root: string): string[] {
  const prefix = `${root}/`;
  const out: string[] = [];
  const re = /href="\/wiki\/([^"#?]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let t: string;
    try {
      t = decodeURIComponent(m[1]);
    } catch {
      t = m[1];
    }
    t = t.replace(/_/g, " ");
    if (!t.startsWith(prefix)) continue;
    if (t === `${root}/Table of Contents`) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** StrategyWiki: use "<Game>/Table of Contents" + its subpages as a
 *  multi-page walkthrough. Only when the guide is substantial enough. */
export async function findStrategyWikiTarget(
  title: string,
): Promise<AltWalkthrough | null> {
  try {
    const client = makeWikiClient(STRATEGYWIKI_API);
    const guess = bestHit(await client.searchTitles(title, 8), title, 50);
    if (!guess) return null;

    // Search likes to rank redirect variants ("Chrono trigger") first, and
    // subpage paths are case-sensitive — so resolve to the canonical title.
    const root = (await client.resolvedTitle(guess)) ?? guess;

    const tocTitle = `${root}/Table of Contents`;
    const exists = await client.existingPages([tocTitle]);
    if (!exists.has(tocTitle)) return null;

    const toc = await client.fetchPage(tocTitle);
    const pages = extractSubpageLinks(toc.html, root).slice(
      0,
      STRATEGYWIKI_MAX_PAGES,
    );
    if (pages.length < STRATEGYWIKI_MIN_PAGES) return null;

    return {
      hit: {
        api: STRATEGYWIKI_API,
        origin: client.origin,
        wikiName: new URL(STRATEGYWIKI_API).hostname,
        score: 0,
        matchedTitle: root,
      },
      target: {
        pages,
        matchedTitle: root,
        kind: "walkthrough",
        sourcePage: root,
      },
    };
  } catch {
    return null;
  }
}
