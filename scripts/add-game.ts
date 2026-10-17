/**
 * Add or refresh a single game from any MediaWiki-based wiki.
 *
 * Usage:
 *   node scripts/add-game.ts \
 *     --slug=hollow-knight \
 *     --title="Hollow Knight" \
 *     --api=https://hollowknight.fandom.com \
 *     --pages="Walkthrough|Walkthrough/Part 1" \
 *     [--platform="PC · Switch"] [--year=2017] [--desc="..."] \
 *     [--cover="Hollow Knight"] [--wiki-name="Hollow Knight Wiki"]
 *
 * If --pages is omitted, the script tries to discover walkthrough pages
 * on the wiki automatically.
 */
import { makeWikiClient } from "../src/lib/wiki/mediawiki.ts";
import { DEFAULT_SKIP_PATTERN } from "../src/lib/wiki/htmlclean.ts";
import { seedGame } from "./seed.ts";
import { rebuildFts, dbStats, getGameBySlug } from "../src/lib/db.ts";
import type { GameConfig } from "./games.config.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? "true";
  }
  return out;
}

function normalizeApi(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//.test(url)) url = "https://" + url;
  if (!/api\.php$/.test(url)) {
    url = url.replace(/\/+$/, "");
    if (!/\/api\.php$/.test(url)) url += "/api.php";
  }
  return url;
}

const DISCOVERY_CANDIDATES = [
  "Walkthrough",
  "Walkthrough/",
  "Gameplay walkthrough",
  "Guide",
  "Guide:Getting started",
  "Tutorials/Beginner's guide",
];

async function discoverPages(api: string): Promise<string[]> {
  const client = makeWikiClient(api);
  for (const candidate of DISCOVERY_CANDIDATES) {
    if (await client.pageExists(candidate)) return [candidate];
  }
  const titles = await client.searchTitles("walkthrough guide", 10);
  const hit = titles.find((t) => /walkthrough/i.test(t));
  if (hit) return [hit];
  return [];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.api || !args.slug || !args.title) {
    console.error(
      "Required: --slug=<slug> --title=<game title> --api=<wiki url>\n" +
        'Optional: --pages="Page A|Page B" --platform="PC · PS5" --year=2020\n' +
        '          --desc="..." --cover="Main Page" --wiki-name="..."',
    );
    process.exit(1);
  }

  const api = normalizeApi(args.api);
  let pages = (args.pages ?? "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  if (pages.length === 0) {
    console.log(`No --pages given, trying to discover walkthrough pages on ${api} ...`);
    pages = await discoverPages(api);
    if (pages.length === 0) {
      console.error(
        `Could not auto-discover a walkthrough page on ${api}. ` +
          `Pass the page titles explicitly with --pages="A|B".`,
      );
      process.exit(1);
    }
    console.log(`Discovered: ${pages.map((p) => `"${p}"`).join(", ")}`);
  }

  const config: GameConfig = {
    slug: args.slug,
    title: args.title,
    platform: args.platform ?? "",
    year: args.year ? Number(args.year) : 0,
    description: args.desc ?? "",
    api,
    wikiName: args["wiki-name"] ?? new URL(api).hostname,
    pages,
    coverPage: args.cover ?? pages[0],
    skipPattern: DEFAULT_SKIP_PATTERN,
  };

  await seedGame(config);
  rebuildFts();

  const stats = dbStats();
  const game = getGameBySlug(args.slug);
  console.log(
    `\nDone. "${config.title}" now has ${game?.section_count ?? 0} sections. ` +
      `Database total: ${stats.games} games / ${stats.sections} sections.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
