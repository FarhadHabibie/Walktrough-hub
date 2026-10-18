/**
 * Client-side storage for the standalone app.
 *
 * Everything (games, sections, seed-import flag) lives in IndexedDB, so the
 * app runs fully from the device — no server, no SQLite. Mirrors the API of
 * the old server-side database module.
 */
import type { Game, GameInput, NewSection, SectionRow } from "@/lib/types.ts";

const DB_NAME = "walkthrough-hub";
const DB_VERSION = 1;
const SEED_URL = "seed/catalog.json";

/* ------------------------------------------------------------------ *
 * Change notifications (any write bumps subscribers — e.g. the catalog
 * grid re-reads its list after a delete or a new ingest).
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of [...listeners]) cb();
}

export function subscribeStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* ------------------------------------------------------------------ *
 * IndexedDB plumbing
 * ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("games")) {
        db.createObjectStore("games", { keyPath: "slug" });
      }
      if (!db.objectStoreNames.contains("sections")) {
        const store = db.createObjectStore("sections", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("by_game", "game_slug");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB tidak bisa dibuka"));
    req.onblocked = () => reject(new Error("IndexedDB diblokir tab lain"));
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request gagal"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaksi gagal"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaksi dibatalkan"));
  });
}

function byTitle(a: Game, b: Game): number {
  return a.title.localeCompare(b.title, "id", { sensitivity: "base" });
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export async function listGames(): Promise<Game[]> {
  const db = await openDb();
  const store = db.transaction("games", "readonly").objectStore("games");
  const rows = await reqToPromise(store.getAll() as IDBRequest<Game[]>);
  return rows.sort(byTitle);
}

export async function getGameBySlug(slug: string): Promise<Game | null> {
  const db = await openDb();
  const store = db.transaction("games", "readonly").objectStore("games");
  const row = await reqToPromise(
    store.get(slug) as IDBRequest<Game | undefined>,
  );
  return row ?? null;
}

export async function getSectionsForGame(slug: string): Promise<SectionRow[]> {
  const db = await openDb();
  const store = db.transaction("sections", "readonly").objectStore("sections");
  const rows = await reqToPromise(
    store.index("by_game").getAll(slug) as IDBRequest<SectionRow[]>,
  );
  return rows.sort((a, b) => a.ord - b.ord);
}

/** Token-based catalog search: exact title > prefix > substring > description. */
export async function searchGames(query: string, limit = 12): Promise<Game[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const games = await listGames();

  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 8);
  const scored: Array<{ game: Game; score: number }> = [];

  for (const game of games) {
    const title = game.title.toLowerCase();
    const slug = game.slug.replace(/-/g, " ");
    const desc = (game.description ?? "").toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (title === token) score += 100;
      else if (title.startsWith(token)) score += 60;
      else if (title.includes(token)) score += 30;
      else if (slug.includes(token)) score += 18;
      else if (desc.includes(token)) score += 8;
    }
    if (score > 0) scored.push({ game, score });
  }

  scored.sort((a, b) => b.score - a.score || byTitle(a.game, b.game));
  return scored.slice(0, limit).map((x) => x.game);
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/** Insert or update a game record (counts are maintained separately). */
export async function upsertGame(input: GameInput): Promise<string> {
  const db = await openDb();
  const tx = db.transaction("games", "readwrite");
  const store = tx.objectStore("games");
  const existing = await reqToPromise(
    store.get(input.slug) as IDBRequest<Game | undefined>,
  );
  const now = new Date().toISOString();
  const record: Game = {
    slug: input.slug,
    title: input.title,
    platform: input.platform,
    year: input.year,
    cover_url: input.coverUrl,
    description: input.description,
    wiki_name: input.wikiName,
    source_url: input.sourceUrl,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    section_count: existing?.section_count ?? 0,
    group_count: existing?.group_count ?? 0,
  };
  store.put(record);
  await txDone(tx);
  emit();
  return input.slug;
}

/** Update just the platform label of a game (used by the platform picker). */
export async function setGamePlatform(
  slug: string,
  platform: string | null,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("games", "readwrite");
  const store = tx.objectStore("games");
  const game = await reqToPromise(
    store.get(slug) as IDBRequest<Game | undefined>,
  );
  if (game) {
    game.platform = platform?.trim() ? platform.trim() : null;
    game.updated_at = new Date().toISOString();
    store.put(game);
  }
  await txDone(tx);
  emit();
}

/** Replace all sections of a game and refresh its cached counts. */
export async function replaceSections(
  slug: string,
  sections: NewSection[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["sections", "games"], "readwrite");
  const sectionsStore = tx.objectStore("sections");

  const keys = await reqToPromise(
    sectionsStore.index("by_game").getAllKeys(slug) as IDBRequest<IDBValidKey[]>,
  );
  for (const key of keys) sectionsStore.delete(key);

  sections.forEach((s, i) => {
    const record: Omit<SectionRow, "id"> = {
      game_slug: slug,
      ord: i,
      group_title: s.group ?? null,
      level: s.level ?? 2,
      title: s.title,
      anchor: s.anchor,
      content_html: s.html,
      content_text: s.text ?? "",
      source_url: s.sourceUrl ?? null,
    };
    sectionsStore.add(record);
  });

  const gamesStore = tx.objectStore("games");
  const game = await reqToPromise(
    gamesStore.get(slug) as IDBRequest<Game | undefined>,
  );
  if (game) {
    game.section_count = sections.length;
    game.group_count = new Set(
      sections.map((s) => s.group).filter(Boolean),
    ).size;
    game.updated_at = new Date().toISOString();
    gamesStore.put(game);
  }

  await txDone(tx);
  emit();
}

/** Delete a game and its sections. Returns false when it wasn't there. */
export async function deleteGame(slug: string): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction(["games", "sections"], "readwrite");
  const gamesStore = tx.objectStore("games");
  const sectionsStore = tx.objectStore("sections");

  const existing = await reqToPromise(
    gamesStore.get(slug) as IDBRequest<Game | undefined>,
  );
  if (!existing) {
    await txDone(tx);
    return false;
  }

  gamesStore.delete(slug);
  const keys = await reqToPromise(
    sectionsStore.index("by_game").getAllKeys(slug) as IDBRequest<IDBValidKey[]>,
  );
  for (const key of keys) sectionsStore.delete(key);

  await txDone(tx);
  emit();
  return true;
}

/* ------------------------------------------------------------------ *
 * First-run seed (the catalog from the old server build, exported once
 * to public/seed/catalog.json). Imported only on the very first launch —
 * deletions afterwards are respected, the flag prevents resurrection.
 *
 * Later app builds ship an updated catalog with a higher `version`; a small
 * version stamp next to it (public/seed/version.json) tells an installed app
 * that fresher seed content is available, and the seed games still present
 * get their walkthroughs refreshed in place — without touching progress,
 * platform labels or deletions.
 * ------------------------------------------------------------------ */

const SEED_VERSION_URL = "seed/version.json";

type SeedSection = {
  ord: number;
  group_title: string | null;
  level: number;
  title: string;
  anchor: string;
  content_html: string;
  content_text?: string;
  source_url?: string | null;
};

type SeedGame = {
  slug: string;
  title: string;
  platform?: string | null;
  year?: number | null;
  cover_url?: string | null;
  description?: string | null;
  wiki_name?: string | null;
  source_url?: string | null;
  created_at?: string;
  updated_at?: string;
  sections?: SeedSection[];
};

type SeedFile = { version: number; games?: SeedGame[] };

type SeedMeta = { key: string; done?: boolean; version?: number };

async function readSeedMeta(): Promise<SeedMeta | undefined> {
  const db = await openDb();
  const store = db.transaction("meta", "readonly").objectStore("meta");
  return reqToPromise(
    store.get("seed-import") as IDBRequest<SeedMeta | undefined>,
  );
}

async function fetchSeedCatalog(): Promise<SeedFile | null> {
  try {
    const res = await fetch(SEED_URL, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as SeedFile;
  } catch {
    // offline or missing seed — retry on the next launch
    return null;
  }
}

async function fetchSeedVersion(): Promise<number | null> {
  try {
    const res = await fetch(SEED_VERSION_URL, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: number };
    return typeof data.version === "number" ? data.version : null;
  } catch {
    return null;
  }
}

function seedSectionRecord(
  gameSlug: string,
  s: SeedSection,
): Omit<SectionRow, "id"> {
  return {
    game_slug: gameSlug,
    ord: s.ord,
    group_title: s.group_title ?? null,
    level: s.level ?? 2,
    title: s.title,
    anchor: s.anchor,
    content_html: s.content_html,
    content_text: s.content_text ?? "",
    source_url: s.source_url ?? null,
  };
}

function groupCountOf(sections: SeedSection[]): number {
  return new Set(sections.map((s) => s.group_title).filter(Boolean)).size;
}

/** First launch: import the shipped catalog into an empty database. */
async function importSeedCatalog(data: SeedFile): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["games", "sections", "meta"], "readwrite");
  const gamesStore = tx.objectStore("games");
  const sectionsStore = tx.objectStore("sections");
  const count = await reqToPromise(gamesStore.count());
  if (count === 0) {
    const now = new Date().toISOString();
    for (const g of data.games ?? []) {
      const sections = g.sections ?? [];
      const record: Game = {
        slug: g.slug,
        title: g.title,
        platform: g.platform ?? null,
        year: g.year ?? null,
        cover_url: g.cover_url ?? null,
        description: g.description ?? null,
        wiki_name: g.wiki_name ?? null,
        source_url: g.source_url ?? null,
        created_at: g.created_at ?? now,
        updated_at: g.updated_at ?? now,
        section_count: sections.length,
        group_count: groupCountOf(sections),
      };
      gamesStore.put(record);
      for (const s of sections) sectionsStore.add(seedSectionRecord(g.slug, s));
    }
  }
  tx.objectStore("meta").put({
    key: "seed-import",
    done: true,
    version: data.version,
    at: Date.now(),
  });
  await txDone(tx);
  emit();
}

/** Upgrade path: refresh the content of the seed games that are still
 *  installed. Platform labels and creation dates are user-owned — they stay
 *  as they are — and games the user deleted are not resurrected. */
async function refreshSeedCatalog(data: SeedFile): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["games", "sections", "meta"], "readwrite");
  const gamesStore = tx.objectStore("games");
  const sectionsStore = tx.objectStore("sections");
  const now = new Date().toISOString();

  for (const g of data.games ?? []) {
    const existing = await reqToPromise(
      gamesStore.get(g.slug) as IDBRequest<Game | undefined>,
    );
    if (!existing) continue;

    const keys = await reqToPromise(
      sectionsStore.index("by_game").getAllKeys(g.slug) as IDBRequest<
        IDBValidKey[]
      >,
    );
    for (const key of keys) sectionsStore.delete(key);
    const sections = g.sections ?? [];
    for (const s of sections) sectionsStore.add(seedSectionRecord(g.slug, s));

    const record: Game = {
      ...existing,
      title: g.title,
      year: g.year ?? null,
      cover_url: g.cover_url ?? null,
      description: g.description ?? null,
      wiki_name: g.wiki_name ?? null,
      source_url: g.source_url ?? null,
      updated_at: now,
      section_count: sections.length,
      group_count: groupCountOf(sections),
    };
    gamesStore.put(record);
  }

  tx.objectStore("meta").put({
    key: "seed-import",
    done: true,
    version: data.version,
    at: Date.now(),
  });
  await txDone(tx);
  emit();
}

export async function ensureSeeded(): Promise<void> {
  const flag = await readSeedMeta();

  if (!flag?.done) {
    const data = await fetchSeedCatalog();
    if (data) await importSeedCatalog(data);
    return;
  }

  // A small version stamp shipped next to the catalog decides whether this
  // build's seed content is newer than what the device already has.
  const version = await fetchSeedVersion();
  const known = flag.version ?? 1;
  if (version === null || version <= known) return;
  const data = await fetchSeedCatalog();
  if (data && data.version > known) await refreshSeedCatalog(data);
}
