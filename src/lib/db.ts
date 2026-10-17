import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Game, GameInput, NewSection, SectionRow } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  platform TEXT,
  year INTEGER,
  cover_url TEXT,
  description TEXT,
  wiki_name TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  group_title TEXT,
  level INTEGER NOT NULL DEFAULT 2,
  title TEXT NOT NULL,
  anchor TEXT NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  source_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_sections_game ON sections(game_id, ord);

CREATE VIRTUAL TABLE IF NOT EXISTS games_fts USING fts5(
  slug UNINDEXED,
  title,
  description,
  platform,
  content='games',
  content_rowid='id'
);
`;

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const dbPath =
    process.env.WT_DB_PATH ?? path.join(process.cwd(), "data", "walkthroughs.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  _db = db;
  return db;
}

/** node:sqlite returns rows with a null prototype, which React refuses to
 *  serialize across the server/client boundary — normalize to plain objects. */
function plain<T extends object>(row: T): T {
  return { ...row };
}

const GAME_SUMMARY_SELECT = `
  SELECT g.*,
    (SELECT COUNT(*) FROM sections s WHERE s.game_id = g.id) AS section_count,
    (SELECT COUNT(DISTINCT s.group_title) FROM sections s
      WHERE s.game_id = g.id AND s.group_title IS NOT NULL) AS group_count
  FROM games g
`;

export function listGames(): Game[] {
  const db = getDb();
  const rows = db
    .prepare(`${GAME_SUMMARY_SELECT} ORDER BY g.title COLLATE NOCASE ASC`)
    .all() as unknown as Game[];
  return rows.map(plain);
}

export function getGameBySlug(slug: string): Game | null {
  const db = getDb();
  const row = db
    .prepare(`${GAME_SUMMARY_SELECT} WHERE g.slug = ?`)
    .get(slug) as unknown as Game | undefined;
  return row ? plain(row) : null;
}

export function getSectionsForGame(gameId: number): SectionRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, game_id, ord, group_title, level, title, anchor,
              content_html, content_text, source_url
       FROM sections WHERE game_id = ? ORDER BY ord ASC`,
    )
    .all(gameId) as unknown as SectionRow[];
  return rows.map(plain);
}

export function searchGames(query: string, limit = 12): Game[] {
  const db = getDb();
  const q = query.trim();
  if (q.length < 2) return [];

  const tokens = q
    .replace(/["*(){}:^\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

  if (tokens.length > 0) {
    const match = tokens.map((t) => `"${t}"*`).join(" ");
    try {
      const rows = db
        .prepare(
          `${GAME_SUMMARY_SELECT}
           WHERE g.id IN (
             SELECT rowid FROM games_fts WHERE games_fts MATCH ?
             ORDER BY bm25(games_fts) LIMIT ?
           )
           ORDER BY g.title COLLATE NOCASE ASC`,
        )
        .all(match, limit) as unknown as Game[];
      if (rows.length > 0) return rows.map(plain);
    } catch {
      // fall through to LIKE search
    }
  }

  const like = `%${q}%`;
  const rows = db
    .prepare(
      `${GAME_SUMMARY_SELECT}
       WHERE g.title LIKE ? OR COALESCE(g.description, '') LIKE ?
       ORDER BY g.title COLLATE NOCASE ASC LIMIT ?`,
    )
    .all(like, like, limit) as unknown as Game[];
  return rows.map(plain);
}

export function upsertGame(input: GameInput): number {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM games WHERE slug = ?`)
    .get(input.slug) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE games SET title = ?, platform = ?, year = ?, cover_url = ?,
        description = ?, wiki_name = ?, source_url = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      input.title,
      input.platform,
      input.year,
      input.coverUrl,
      input.description,
      input.wikiName,
      input.sourceUrl,
      existing.id,
    );
    return Number(existing.id);
  }

  const info = db
    .prepare(
      `INSERT INTO games (slug, title, platform, year, cover_url, description, wiki_name, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.slug,
      input.title,
      input.platform,
      input.year,
      input.coverUrl,
      input.description,
      input.wikiName,
      input.sourceUrl,
    );
  return Number(info.lastInsertRowid);
}

export function replaceSections(gameId: number, sections: NewSection[]): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM sections WHERE game_id = ?`).run(gameId);
    const insert = db.prepare(
      `INSERT INTO sections
         (game_id, ord, group_title, level, title, anchor, content_html, content_text, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    sections.forEach((s, i) => {
      insert.run(
        gameId,
        i,
        s.group ?? null,
        s.level ?? 2,
        s.title,
        s.anchor,
        s.html,
        s.text ?? "",
        s.sourceUrl ?? null,
      );
    });
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function rebuildFts(): void {
  const db = getDb();
  db.exec(`INSERT INTO games_fts(games_fts) VALUES ('rebuild');`);
}

export function deleteGame(slug: string): boolean {
  const db = getDb();
  const info = db.prepare(`DELETE FROM games WHERE slug = ?`).run(slug);
  const deleted = Number(info.changes) > 0;
  if (deleted) rebuildFts();
  return deleted;
}

export function dbStats(): { games: number; sections: number; chars: number } {
  const db = getDb();
  const g = db.prepare(`SELECT COUNT(*) AS c FROM games`).get() as { c: number };
  const s = db
    .prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(content_text)), 0) AS chars FROM sections`)
    .get() as { c: number; chars: number };
  return { games: Number(g.c), sections: Number(s.c), chars: Number(s.chars) };
}
