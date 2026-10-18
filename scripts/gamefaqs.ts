/**
 * Server-side GameFAQs fetcher — desktop helper.
 *
 * The web app is a static SPA (no CORS to gamefaqs.gamespot.com), but on the
 * desktop it always runs behind `scripts/serve.ts`. That little local server
 * does the fetching (same machine, so GameFAQs treats it like a normal visit),
 * and the app reads the result from `/api/gamefaqs/*` — no copy-paste needed.
 *
 * The chain: search → game page → FAQ list → best walkthrough. Pages answer
 * with a `?validate=1` redirect that drops cookies; we keep a small cookie jar
 * and follow redirects manually.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const ORIGIN = "https://gamefaqs.gamespot.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAX_HTML_BYTES = 12_000_000;
const CURL_TIMEOUT_MS = 30_000;

export type FaqPayload = {
  gameTitle: string;
  faqTitle: string;
  author: string | null;
  sourceUrl: string;
  text: string;
};

/* ------------------------------------------------------------------ *
 * Fetching (curl child process + one cookie jar per chain)
 *
 * Node's fetch (undici) gets a hard 403 from Cloudflare — its TLS
 * fingerprint is not Chrome's. curl on the same machine sails through,
 * so the local helper shells out to it. The `?validate=1` gate drops
 * cookies, so a jar file is kept for the whole chain.
 * ------------------------------------------------------------------ */

const run = promisify(execFile);

let curlChecked: Promise<boolean> | null = null;

/** Is the `curl` binary available on this machine? (cached) */
export function hasCurl(): Promise<boolean> {
  curlChecked ??= run("curl", ["--version"], { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  return curlChecked;
}

async function gfGet(url: string, jarPath: string, writeJar = true): Promise<string> {
  const args = ["-s", "-L", "--compressed", "--max-time", "25"];
  // Parallel guide-section fetches share the jar read-only — concurrent -c
  // writes would race on the jar file.
  if (writeJar) args.push("-c", jarPath);
  args.push(
    "-b",
    jarPath,
    "-A",
    UA,
    "-H",
    "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H",
    "Accept-Language: en-US,en;q=0.9",
    "-H",
    'sec-ch-ua: "Chromium";v="141", "Not?A_Brand";v="24", "Google Chrome";v="141"',
    "-H",
    "sec-ch-ua-mobile: ?0",
    "-H",
    'sec-ch-ua-platform: "Windows"',
    "-w",
    "\n%{http_code}",
    url,
  );
  const { stdout } = await run("curl", args, {
    maxBuffer: 32 * 1024 * 1024,
    timeout: CURL_TIMEOUT_MS,
  });

  const idx = stdout.lastIndexOf("\n");
  const status = Number(stdout.slice(idx + 1).trim());
  const body = stdout.slice(0, idx);

  if (!body) throw new Error("respons kosong dari GameFAQs");
  if (body.length > MAX_HTML_BYTES) throw new Error("respons terlalu besar");
  if (!Number.isFinite(status) || status >= 400) {
    throw new Error(`HTTP ${Number.isFinite(status) ? status : "?"}`);
  }
  if (/cf-mitigated|Just a moment\.\.\./i.test(body)) {
    throw new Error("GameFAQs sedang memblokir permintaan (Cloudflare)");
  }
  return body;
}

/* ------------------------------------------------------------------ *
 * HTML helpers
 * ------------------------------------------------------------------ */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code.startsWith("#")) {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ""));
}

function pageTitle(html: string): string {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return m ? stripTags(m[1]).trim() : "";
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

type GameLink = { path: string; title: string; row: number };

export function parseSearchGames(html: string): GameLink[] {
  const out: GameLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[1];
    const href = /href="([^"]+)"/.exec(attrs)?.[1];
    if (!href) continue;
    if (!/^\/[a-z0-9-]+\/\d+-[a-z0-9-]+$/.test(href)) continue;
    if (/^\/(boards|user|my|search|features|forums)\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    // GameFAQs rank results itself; row 1 is their best match. Sub-links of a
    // row ("1.1", "1.2", …) point at /data, /faqs etc. and are filtered out
    // by the href shape above, so the plain "N" rows survive here.
    const rowAttr = /data-row="(\d+)(?:\.\d+)?"/.exec(attrs)?.[1];
    out.push({
      path: href,
      title: stripTags(m[2]).trim() || href,
      row: rowAttr ? parseInt(rowAttr, 10) : 9999,
    });
  }
  return out;
}

export function scoreGames(games: GameLink[], query: string): GameLink[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  const hits = (g: GameLink): number => {
    const title = g.title.toLowerCase();
    const href = g.path.toLowerCase();
    let s = 0;
    for (const t of tokens) {
      if (title.includes(t)) s += 2;
      else if (href.includes(t)) s += 1;
    }
    return s;
  };
  const allHit = (g: GameLink): boolean => {
    const title = g.title.toLowerCase();
    return tokens.every((t) => title.includes(t));
  };
  // GameFAQs merges every platform of a game into one page (the URL slug is
  // just the first platform — Chrono Trigger's hub lives under /android/…),
  // so their own relevance rank is the strongest signal. Ties go to the
  // shortest title — closest to what was typed ("Chrono Trigger" beats
  // "BS Chrono Trigger Music Library").
  return [...games].sort(
    (a, b) =>
      Number(allHit(b)) - Number(allHit(a)) ||
      hits(b) - hits(a) ||
      a.row - b.row ||
      a.title.length - b.title.length ||
      a.path.localeCompare(b.path),
  );
}

/* ------------------------------------------------------------------ *
 * Query repair — "tales ofvesperia" → "tales of vesperia"
 *
 * Users often type without the inner spaces. GameFAQs' own fuzzy search
 * then drops the real match entirely and only returns near-misses, whose
 * row 1 wins the tie — the wrong game gets imported. Respacing the query
 * before the retry fixes that.
 * ------------------------------------------------------------------ */

const GLUE_WORDS = ["of", "the", "and", "to", "in", "on"] as const;

/** Split a glued token like "talesofvesperia" into "tales of vesperia". */
function unglueWord(word: string): string {
  if (word.length < 6) return word;
  for (const g of GLUE_WORDS) {
    const i = word.lastIndexOf(g);
    if (i < 0) continue;
    const left = word.slice(0, i);
    const right = word.slice(i + g.length);
    const rightOk = g === "of" ? right.length >= 2 : right.length >= 3;
    const ok =
      i > 0
        ? left.length >= 3 && rightOk
        : (g === "of" || g === "the" || g === "and") && right.length >= 4;
    if (ok) {
      return `${unglueWord(left)}${left ? " " : ""}${g} ${unglueWord(right)}`;
    }
  }
  return word;
}

/** Best-effort respacing of a query typed without inner spaces. */
export function correctQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((w) => unglueWord(w.toLowerCase()))
    .join(" ");
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function parseGameTitle(html: string): string | null {
  const title = pageTitle(html);
  if (!title) return null;
  const m = /^(.+?) FAQs,/i.exec(title);
  if (m) return m[1].trim();
  return title.replace(/ - GameFAQs$/i, "").replace(/ for .+$/i, "").trim() || null;
}

export type FaqEntry = { id: string; path: string; title: string; kb: number };

// Sizes read "345K" on the classic table template and "746KB" on the newer
// guide-card template, so the optional B matters.
const KB_RE = /(\d+(?:\.\d+)?)K(?:B)?\b/gi;

export function parseFaqsList(html: string): FaqEntry[] {
  const out = new Map<string, FaqEntry>();
  const put = (entry: FaqEntry) => {
    const cur = out.get(entry.id);
    if (cur) {
      entry = {
        id: entry.id,
        path: entry.path,
        title: entry.title.length > cur.title.length ? entry.title : cur.title,
        kb: Math.max(cur.kb, entry.kb),
      };
    }
    out.set(entry.id, entry);
  };

  // Classic template: one <tr> per FAQ, size in the same row.
  if (/<tr[\s>]/i.test(html)) {
    for (const row of html.split(/<tr[\s>]/i)) {
      const m = /<a[^>]+href="([^"]*\/faqs\/(\d+))"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
      if (!m) continue;
      const sizes = [...row.matchAll(KB_RE)].map((x) => parseFloat(x[1]));
      put({
        id: m[2],
        path: m[1],
        title: stripTags(m[3]).trim(),
        kb: sizes.length ? Math.max(...sizes) : 0,
      });
    }
  }

  // Newer template lists guides as <li> cards (no <tr> at all): title link,
  // then meta text like "v1.01, 746KB, 2022" right after it.
  const re = /<a[^>]+href="([^"]*\/faqs\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const id = m[2];
    if (out.has(id)) continue;
    const title = stripTags(m[3]).trim();
    if (!title) continue;
    const tail = html.slice(m.index, m.index + 600);
    const sizes = [...tail.matchAll(KB_RE)].map((x) => parseFloat(x[1]));
    put({
      id,
      path: m[1],
      title,
      kb: sizes.length ? Math.max(...sizes) : 0,
    });
  }
  return [...out.values()];
}

/** Walkthroughs beat guides, guides beat loose FAQs; bigger beats smaller. */
function faqRank(title: string): number {
  if (/walkthrough/i.test(title)) return 0;
  if (/guide/i.test(title)) return 1;
  if (/faq/i.test(title)) return 2;
  return 3;
}

export function pickBestFaq(faqs: FaqEntry[]): FaqEntry | null {
  if (faqs.length === 0) return null;
  return [...faqs].sort(
    (a, b) => faqRank(a.title) - faqRank(b.title) || b.kb - a.kb,
  )[0];
}

export function parseFaqBody(html: string): string {
  const pres: string[] = [];
  for (const m of html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)) {
    const t = stripTags(m[1]).replace(/[ \t]+$/gm, "");
    if (t.trim().length > 0) pres.push(t);
  }
  return pres
    .join("\n\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/* ------------------------------------------------------------------ *
 * HTML guides ("Walkthrough & Guide" pages)
 *
 * Newer GameFAQs submissions render as web pages instead of ASCII text
 * (no <pre>): the body lives in div#faqwrap and each table-of-contents
 * entry is its own page. Detection is simply "the <pre> pass found
 * nothing". Larger guides have 100+ section pages, so they are fetched
 * with small concurrency against a deadline.
 * ------------------------------------------------------------------ */

const MAX_GUIDE_SECTIONS = 200;
const GUIDE_CONCURRENCY = 6;
const GUIDE_DEADLINE_MS = 120_000;

export type GuideSection = { slug: string; title: string };

/** Convert one page's guide body (headings, paragraphs, lists) to plain text. */
function htmlRegionToText(region: string): string {
  let s = region
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<(p|h[1-6]|li|tr|ol|ul|table|div|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|tr|ol|ul|table|div|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ *\| ?/gm, "")
    .replace(/ \| ?\n/g, "\n")
    .replace(/ *\| *$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseHtmlGuide(
  html: string,
): { text: string; toc: GuideSection[] } | null {
  const start = html.search(/<div[^>]*id="faqwrap"[^>]*>/i);
  if (start < 0) return null;
  // Body ends where the pager pod ("Next: …") begins.
  const nav = html.indexOf('<ul class="paginate"', start);
  let region = html.slice(start, nav > start ? nav : undefined);

  const toc: GuideSection[] = [];
  const seen = new Set<string>();
  const ftoc = /<div[^>]*class="ftoc"[^>]*>([\s\S]*?)<\/div>/i.exec(region);
  if (ftoc) {
    for (const m of ftoc[1].matchAll(
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    )) {
      const slug = m[1];
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug) || seen.has(slug)) continue;
      seen.add(slug);
      toc.push({
        slug,
        title: stripTags(m[2]).replace(/\s+/g, " ").trim() || slug,
      });
    }
    region = region.replace(/<div[^>]*class="ftoc"[^>]*>[\s\S]*?<\/div>/i, "");
  }
  return { text: htmlRegionToText(region), toc };
}

/** Small parallel map for the section crawl. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/** Drop the section's own heading line when it repeats the TOC label. */
function stripDupTitle(body: string, title: string): string {
  const nl = body.indexOf("\n");
  const first = (nl < 0 ? body : body.slice(0, nl)).trim().toLowerCase();
  if (first !== title.replace(/\s+/g, " ").trim().toLowerCase()) return body;
  return body.slice(nl < 0 ? body.length : nl).replace(/^\n+/, "");
}

/**
 * Text of one picked FAQ. Classic ASCII pages pass through unchanged; HTML
 * guides get converted, and paginated guides get every TOC section fetched
 * and joined so the import is the complete guide, not just its first page.
 */
async function faqText(pick: FaqEntry, faqHtml: string, jar: string): Promise<string> {
  const preText = parseFaqBody(faqHtml);
  if (preText.length >= 800) return preText;
  const guide = parseHtmlGuide(faqHtml);
  if (!guide || guide.text.length < 300) return preText;
  if (guide.toc.length === 0 || guide.toc.length > MAX_GUIDE_SECTIONS) {
    return guide.text;
  }

  const base = `${ORIGIN}${pick.path.replace(/\/+$/, "")}`;
  const deadline = Date.now() + GUIDE_DEADLINE_MS;
  const pages = await mapLimit(guide.toc, GUIDE_CONCURRENCY, async (sec) => {
    if (Date.now() > deadline) return null;
    try {
      const secHtml = await gfGet(`${base}/${sec.slug}`, jar, false);
      const parsed = parseHtmlGuide(secHtml);
      return parsed && parsed.text ? { ...sec, text: parsed.text } : null;
    } catch {
      return null;
    }
  });
  const ok = pages.filter(
    (p): p is GuideSection & { text: string } => p !== null,
  );
  // A few flaky sections are tolerable; a mostly-empty crawl is not.
  const enough = pages.every((p) => p !== null)
    ? ok.length >= Math.max(1, Math.floor(guide.toc.length * 0.7))
    : ok.length >= 8;
  if (!enough) return guide.text;
  return ok
    .map(
      (p) =>
        `${p.title.slice(0, 80).toUpperCase()}\n\n${stripDupTitle(p.text, p.title)}`,
    )
    .join("\n\n\n");
}

/* ------------------------------------------------------------------ *
 * The whole chain
 * ------------------------------------------------------------------ */

export async function fetchGamefaq(query: string): Promise<FaqPayload> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wth-gf-"));
  const jar = path.join(dir, "cookies.txt");
  try {
    const searchHtml = await gfGet(
      `${ORIGIN}/search?game=${encodeURIComponent(query)}`,
      jar,
    );
    const games = parseSearchGames(searchHtml);
    if (games.length === 0) throw new Error("game tidak ditemukan di GameFAQs");
    let game = scoreGames(games, query)[0];

    // Glued stopwords ("tales ofvesperia") make GameFAQs' fuzzy search drop
    // the real match, leaving only near-misses for row 1 to win — the wrong
    // game. Retry once with the respaced query, but only trust the retry
    // when its winner matches every token of the corrected query.
    const toks = queryTokens(query);
    const allHit = (g: GameLink): boolean =>
      toks.length > 0 && toks.every((t) => g.title.toLowerCase().includes(t));
    if (!allHit(game)) {
      const fixed = correctQuery(query);
      if (fixed.toLowerCase() !== query.toLowerCase()) {
        const retry = parseSearchGames(
          await gfGet(`${ORIGIN}/search?game=${encodeURIComponent(fixed)}`, jar),
        );
        const toks2 = queryTokens(fixed);
        const cand = retry.length ? scoreGames(retry, fixed)[0] : undefined;
        if (
          cand &&
          toks2.length > 0 &&
          toks2.every((t) => cand.title.toLowerCase().includes(t))
        ) {
          game = cand;
        }
      }
    }

    const listHtml = await gfGet(
      `${ORIGIN}${game.path.replace(/\/+$/, "")}/faqs`,
      jar,
    );
    const gameTitle = parseGameTitle(listHtml) ?? game.title;
    const faqs = parseFaqsList(listHtml);
    const pick = pickBestFaq(faqs);
    if (!pick) throw new Error("game ini tidak punya FAQ di GameFAQs");

    const faqHtml = await gfGet(`${ORIGIN}${pick.path}`, jar);
    const text = await faqText(pick, faqHtml, jar);
    if (text.length < 800) throw new Error("FAQ kosong atau gagal diambil");

    // "Pokemon Ruby Version - Guide and Walkthrough - GBA - By author - GameFAQs"
    const fullTitle = pageTitle(faqHtml);
    const segments = fullTitle.split(" - ");
    const authorSeg = segments.find((s) => /^by /i.test(s));
    const faqTitle =
      segments.find((s) => /walkthrough|guide|faq/i.test(s)) ?? pick.title;

    return {
      gameTitle,
      faqTitle: faqTitle.trim() || "Walkthrough",
      author: authorSeg ? authorSeg.replace(/^by /i, "").trim() : null,
      sourceUrl: `${ORIGIN}${pick.path}`,
      text,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
