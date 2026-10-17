/**
 * Seed configuration: which games to scrape on `npm run seed`.
 *
 * Every entry points at a MediaWiki `api.php` (Fandom, wiki.gg, ...) plus
 * the exact page titles that make up the walkthrough. Page order = reading
 * order in the app.
 *
 * Add more games with `npm run add-game -- --slug=... --api=... --pages=...`
 * or by adding entries here and re-running `npm run seed`.
 */
export type GameConfig = {
  slug: string;
  title: string;
  platform: string;
  year: number;
  description: string;
  /** MediaWiki api.php endpoint. */
  api: string;
  /** Human-readable wiki name for attribution. */
  wikiName: string;
  /** Ordered list of page titles on that wiki. */
  pages: string[];
  /** Page used to look up a cover image (usually the game's main page). */
  coverPage?: string;
  /** Extra section-title skip pattern for this game. */
  skipPattern?: RegExp;
};

export const DEFAULT_SKIP_PATTERN =
  /^(trivia|related content|video walkthrough|references|external links|see also|notes|navigation|site navigation|sources|gallery|bugs)$/i;

export const GAMES: GameConfig[] = [
  {
    slug: "elden-ring",
    title: "Elden Ring",
    platform: "PC · PS4/PS5 · Xbox",
    year: 2022,
    description:
      "An open-world action RPG by FromSoftware. This 24-step guide walks you through the entire critical path, from the Chapel of Anticipation to the final boss — without missing major content.",
    api: "https://eldenring.fandom.com/api.php",
    wikiName: "Elden Ring Wiki (Fandom)",
    pages: ["Elden Ring Guide"],
    coverPage: "Elden Ring (game)",
  },
  {
    slug: "red-dead-redemption-2",
    title: "Red Dead Redemption 2",
    platform: "PC · PS4 · Xbox One",
    year: 2018,
    description:
      "Rockstar's western epic. Every story mission, organized by chapter — from Colter to Beecher's Hope, plus stranger missions.",
    api: "https://reddead.fandom.com/api.php",
    wikiName: "Red Dead Wiki (Fandom)",
    pages: ["Missions in Redemption 2"],
    coverPage: "Red Dead Redemption 2",
  },
  {
    slug: "the-witcher-3-wild-hunt",
    title: "The Witcher 3: Wild Hunt",
    platform: "PC · PS4/PS5 · Xbox · Switch",
    year: 2015,
    description:
      "CD Projekt Red's monster-hunting RPG. The full main quest line, act by act — from the Prologue to the Wild Hunt finale.",
    api: "https://witcher.fandom.com/api.php",
    wikiName: "Witcher Wiki (Fandom)",
    pages: ["The Witcher 3 main quests"],
    coverPage: "The Witcher 3: Wild Hunt",
  },
  {
    slug: "terraria",
    title: "Terraria",
    platform: "PC · Console · Mobile",
    year: 2011,
    description:
      "Dig, fight, explore, build. This guide takes you from your very first character and world all the way to the endgame bosses.",
    api: "https://terraria.wiki.gg/api.php",
    wikiName: "Terraria Wiki (wiki.gg)",
    pages: ["Guide:Getting started"],
    coverPage: "Terraria",
  },
  {
    slug: "minecraft",
    title: "Minecraft",
    platform: "PC · Console · Mobile",
    year: 2011,
    description:
      "The definitive sandbox survival guide: controls, your first day, surviving the night, and building your first base — straight from the official wiki's Beginner's guide.",
    api: "https://minecraft.wiki/api.php",
    wikiName: "Minecraft Wiki",
    pages: ["Tutorials/Beginner's guide"],
    coverPage: "Minecraft",
  },
];
