/**
 * Platform choices for the pickers (add-a-game flow + game header), and the
 * alias terms used to recognize a platform-specific edition page on
 * StrategyWiki ("Tetris DS", "Doom (Game Boy Advance)", "Final Fantasy VI
 * Advance", …).
 */

export type PlatformGroup = { label: string; items: string[] };

export const PLATFORM_GROUPS: PlatformGroup[] = [
  { label: "Modern", items: ["PC", "PlayStation", "Xbox", "Switch", "Mobile"] },
  { label: "Retro", items: ["NES", "SNES", "GBA", "DS", "PS2", "PSP"] },
];

export const PLATFORM_CHOICES: string[] = PLATFORM_GROUPS.flatMap(
  (g) => g.items,
);

const ALIASES: Record<string, string[]> = {
  PC: ["PC", "Windows", "Microsoft Windows", "MS-DOS", "DOS", "Linux", "Macintosh", "Mac OS"],
  PlayStation: [
    "PlayStation",
    "PS1",
    "PS2",
    "PS3",
    "PS4",
    "PS5",
    "PlayStation 2",
    "PlayStation 3",
    "PlayStation 4",
    "PlayStation 5",
  ],
  Xbox: ["Xbox", "Xbox 360", "Xbox One", "Xbox Series"],
  Switch: ["Switch", "Nintendo Switch"],
  Mobile: ["Mobile", "Android", "iOS", "iPhone", "iPad", "J2ME", "Phones"],
  NES: ["NES", "Nintendo Entertainment System", "Famicom"],
  SNES: ["SNES", "Super NES", "Super Nintendo", "Super Famicom"],
  GBA: ["GBA", "Game Boy Advance", "Advance"],
  DS: ["DS", "Nintendo DS", "NDS"],
  PS2: ["PS2", "PlayStation 2"],
  PSP: ["PSP", "PlayStation Portable"],
};

export function platformAliases(platform: string): string[] {
  return ALIASES[platform] ?? [platform];
}

export function isPlatformChoice(value: string): boolean {
  return PLATFORM_CHOICES.includes(value);
}

/**
 * Whole-word alias match on a `normalizeForMatch`-style string. Word based on
 * purpose: "ds" must not match "sounds", "nes" must not match "jones".
 */
function matchesAlias(normalized: string, alias: string): boolean {
  const words = normalized.split(" ");
  const aliasWords = alias.toLowerCase().split(" ");
  if (aliasWords.some((w) => !w)) return false;
  if (aliasWords.length === 1) return words.includes(aliasWords[0]);
  for (let i = 0; i + aliasWords.length <= words.length; i++) {
    if (aliasWords.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

/** Does a normalized title mention the given platform (any alias)? */
export function platformMatches(normalized: string, platform: string): boolean {
  return platformAliases(platform).some((a) => matchesAlias(normalized, a));
}
