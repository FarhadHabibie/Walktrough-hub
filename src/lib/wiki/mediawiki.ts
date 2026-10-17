/**
 * Minimal MediaWiki API client used by the seed / add-game scripts and by
 * the on-demand web ingestion. Works with Fandom, wiki.gg and other
 * MediaWiki-based wikis.
 */

const UA =
  "WalkthroughHub/0.1 (personal project; contact: local dev) node-fetch";

export type ParsedPage = {
  title: string;
  html: string;
  sourceUrl: string;
  revid?: number;
};

export type WikiClient = {
  origin: string;
  apiUrl: string;
  fetchPage: (page: string) => Promise<ParsedPage>;
  fetchCover: (page: string) => Promise<string | null>;
  pageExists: (page: string) => Promise<boolean>;
  /** Which of the given page titles exist (resolves redirects), in one API call. */
  existingPages: (titles: string[]) => Promise<Set<string>>;
  /** Wikitext size (bytes) for existing pages, keyed by lowercase title. */
  pageSizes: (titles: string[]) => Promise<Map<string, number>>;
  searchTitles: (term: string, limit?: number) => Promise<string[]>;
};

function absolutize(raw: string | null | undefined, origin: string): string | null {
  if (!raw) return null;
  const url = raw.trim().replace(/&amp;/g, "&");
  if (!url) return null;
  if (/^(data|javascript):/i.test(url)) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return origin + url;
  if (/^https?:/i.test(url)) return url;
  return null;
}

export function makeWikiClient(apiUrl: string): WikiClient {
  const api = new URL(apiUrl);
  const origin = api.origin;

  async function call(params: Record<string, string>): Promise<unknown> {
    const url = new URL(apiUrl);
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${apiUrl} (${params.action})`);
    return res.json();
  }

  return {
    origin,
    apiUrl,

    async fetchPage(page: string): Promise<ParsedPage> {
      const data = (await call({
        action: "parse",
        page,
        prop: "text|revid",
        redirects: "1",
        disableeditsection: "1",
        disabletoc: "1",
      })) as {
        parse?: { title?: string; text?: string; revid?: number };
        error?: { code?: string };
      };
      if (!data.parse) {
        const code = data.error?.code ?? "unknown";
        throw new Error(`Page not found on ${origin}: "${page}" (${code})`);
      }
      const title: string = data.parse.title ?? page;
      const html: string = data.parse.text ?? "";
      const wikiTitle = title.replace(/ /g, "_");
      return {
        title,
        html,
        sourceUrl: `${origin}/wiki/${encodeURIComponent(wikiTitle)}`,
        revid: data.parse.revid,
      };
    },

    async fetchCover(page: string): Promise<string | null> {
      // 1) PageImages API (works on some wikis)
      try {
        const data = (await call({
          action: "query",
          prop: "pageimages",
          titles: page,
          pithumbsize: "640",
          redirects: "1",
        })) as { query?: { pages?: Array<{ thumbnail?: { source?: string } }> } };
        const p = data.query?.pages?.[0];
        const src: string | undefined = p?.thumbnail?.source;
        if (src) return absolutize(src, origin);
      } catch {
        // continue to infobox fallback
      }

      // 2) First image inside an infobox / portable infobox on the page itself
      try {
        const data = (await call({
          action: "parse",
          page,
          prop: "text",
          redirects: "1",
          disableeditsection: "1",
          disabletoc: "1",
        })) as { parse?: { text?: string } };
        const html: string = data.parse?.text ?? "";
        const patterns = [
          /class="[^"]*pi-image[^"]*"[\s\S]{0,800}?<img[^>]+src="([^"]+)"/i,
          /class="[^"]*(?:portable-)?infobox[^"]*"[\s\S]{0,1200}?<img[^>]+src="([^"]+)"/i,
          /<table[^>]*class="[^"]*infobox[^"]*"[\s\S]{0,1200}?<img[^>]+src="([^"]+)"/i,
          /<figure[\s\S]{0,400}?<img[^>]+src="([^"]+)"/i,
        ];
        for (const re of patterns) {
          const m = re.exec(html);
          const url = absolutize(m?.[1], origin);
          if (url) return url;
        }
        const first = /<img[^>]+src="([^"]+)"/i.exec(html);
        return absolutize(first?.[1], origin);
      } catch {
        return null;
      }
    },

    async pageExists(page: string): Promise<boolean> {
      try {
        const data = (await call({
          action: "query",
          titles: page,
          redirects: "1",
        })) as { query?: { pages?: Array<{ missing?: boolean }> } };
        const p = data.query?.pages?.[0];
        return Boolean(p && !p.missing);
      } catch {
        return false;
      }
    },

    async existingPages(titles: string[]): Promise<Set<string>> {
      const wanted = titles.filter(Boolean);
      if (wanted.length === 0) return new Set();
      try {
        const data = (await call({
          action: "query",
          titles: wanted.join("|"),
          redirects: "1",
        })) as {
          query?: {
            normalized?: Array<{ from: string; to: string }>;
            redirects?: Array<{ from: string; to: string }>;
            pages?: Array<{ title: string; missing?: boolean }>;
          };
        };
        const q = data.query ?? {};
        const live = new Set(
          (q.pages ?? []).filter((p) => !p.missing).map((p) => p.title),
        );
        const alias = new Map<string, string>();
        for (const n of q.normalized ?? []) alias.set(n.from, n.to);
        for (const r of q.redirects ?? []) alias.set(r.from, r.to);
        const out = new Set<string>();
        for (const t of wanted) {
          const resolved = alias.get(t) ?? t;
          if (live.has(resolved) || live.has(t)) out.add(t);
        }
        return out;
      } catch {
        return new Set();
      }
    },

    async pageSizes(titles: string[]): Promise<Map<string, number>> {
      const wanted = titles.filter(Boolean);
      const out = new Map<string, number>();
      if (wanted.length === 0) return out;
      try {
        const data = (await call({
          action: "query",
          titles: wanted.join("|"),
          prop: "info",
          redirects: "1",
        })) as {
          query?: { pages?: Array<{ title: string; length?: number; missing?: boolean }> };
        };
        for (const p of data.query?.pages ?? []) {
          if (!p.missing) out.set(p.title.toLowerCase(), p.length ?? 0);
        }
      } catch {
        // sizes unavailable — callers fall back to their default priority
      }
      return out;
    },

    async searchTitles(term: string, limit = 10): Promise<string[]> {
      try {
        const data = (await call({
          action: "query",
          list: "search",
          srsearch: term,
          srlimit: String(limit),
          srprop: "",
        })) as { query?: { search?: Array<{ title: string }> } };
        return (data.query?.search ?? []).map((x) => x.title);
      } catch {
        return [];
      }
    },
  };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
