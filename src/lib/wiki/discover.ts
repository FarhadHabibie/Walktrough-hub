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
