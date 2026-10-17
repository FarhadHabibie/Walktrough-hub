export type Game = {
  id: number;
  slug: string;
  title: string;
  platform: string | null;
  year: number | null;
  cover_url: string | null;
  description: string | null;
  wiki_name: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  section_count: number;
  group_count: number;
};

export type SectionRow = {
  id: number;
  game_id: number;
  ord: number;
  group_title: string | null;
  level: number;
  title: string;
  anchor: string;
  content_html: string;
  content_text: string;
  source_url: string | null;
};

/** Lightweight shape passed to client components (no large HTML). */
export type SectionMeta = {
  id: number;
  ord: number;
  group_title: string | null;
  level: number;
  title: string;
  anchor: string;
};

export type NewSection = {
  group: string | null;
  level: number;
  title: string;
  anchor: string;
  html: string;
  text: string;
  sourceUrl: string | null;
};

export type GameInput = {
  slug: string;
  title: string;
  platform: string | null;
  year: number | null;
  coverUrl: string | null;
  description: string | null;
  wikiName: string | null;
  sourceUrl: string | null;
};
