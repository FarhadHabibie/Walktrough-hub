/**
 * Scrape the configured wikis and (re)build the local SQLite database.
 *
 * Usage:
 *   node scripts/seed.ts              # seed every game in games.config.ts
 *   node scripts/seed.ts elden-ring   # seed only specific slugs
 */
import { makeWikiClient, sleep } from "./lib/mediawiki.ts";
import { cleanAndSplit, type CleanSection } from "./lib/htmlclean.ts";
import { DEFAULT_SKIP_PATTERN, GAMES, type GameConfig } from "./games.config.ts";
import { dbStats, rebuildFts, replaceSections, upsertGame } from "../src/lib/db.ts";

export async function scrapeGame(config: GameConfig): Promise<CleanSection[]> {
  const client = makeWikiClient(config.api);
  const sections: CleanSection[] = [];
  const multiPage = config.pages.length > 1;

  for (const page of config.pages) {
    process.stdout.write(`  fetching "${page}" ... `);
    const parsed = await client.fetchPage(page);
    const pageSections = cleanAndSplit(parsed.html, {
      origin: client.origin,
      pageUrl: parsed.sourceUrl,
      group: multiPage ? parsed.title : null,
      skipPattern: config.skipPattern ?? DEFAULT_SKIP_PATTERN,
      fallbackTitle: parsed.title,
    });
    process.stdout.write(`${pageSections.length} sections\n`);
    sections.push(...pageSections);
    await sleep(500);
  }

  return sections;
}

export async function seedGame(config: GameConfig): Promise<void> {
  console.log(`\n== ${config.title} (${config.slug})`);
  const client = makeWikiClient(config.api);

  const sections = await scrapeGame(config);
  if (sections.length === 0) {
    throw new Error(`no sections extracted for ${config.slug}`);
  }

  let cover: string | null = null;
  if (config.coverPage) {
    cover = await client.fetchCover(config.coverPage);
    if (!cover && sections[0]) {
      const m = /<img[^>]+src="([^"]+)"/i.exec(sections[0].html);
      cover = m?.[1] ?? null;
    }
  }

  const chars = sections.reduce((n, s) => n + s.text.length, 0);
  const gameId = upsertGame({
    slug: config.slug,
    title: config.title,
    platform: config.platform,
    year: config.year,
    coverUrl: cover,
    description: config.description,
    wikiName: config.wikiName,
    sourceUrl: config.pages[0]
      ? `${client.origin}/wiki/${encodeURIComponent(config.pages[0].replace(/ /g, "_"))}`
      : null,
  });
  replaceSections(gameId, sections);

  console.log(
    `  -> stored ${sections.length} sections (${chars.toLocaleString()} chars), cover: ${cover ? "yes" : "none"}`,
  );
}

async function main(): Promise<void> {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = wanted.length
    ? GAMES.filter((g) => wanted.includes(g.slug))
    : GAMES;

  if (targets.length === 0) {
    console.error(`No matching games. Known slugs: ${GAMES.map((g) => g.slug).join(", ")}`);
    process.exit(1);
  }

  let failures = 0;
  for (const game of targets) {
    try {
      await seedGame(game);
    } catch (err) {
      failures += 1;
      console.error(`  !! failed: ${(err as Error).message}`);
    }
  }

  rebuildFts();
  const stats = dbStats();
  console.log(
    `\nDatabase: ${stats.games} games, ${stats.sections} sections, ${stats.chars.toLocaleString()} chars of walkthrough text.`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
