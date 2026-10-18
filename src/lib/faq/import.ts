/**
 * Turn a GameFAQs FAQ into a stored game, using the same store as wiki
 * ingest (`upsertGame` + `replaceSections`).
 */
import { getGameBySlug, replaceSections, upsertGame } from "@/lib/store";
import type { Game } from "@/lib/types";
import { deriveTitleFromSlug } from "@/lib/wiki/ingest";
import {
  fetchFaqBest,
  fetchFaqCapture,
  isNative,
  type FaqPayload,
} from "./client.ts";
import { faqSectionsToRows, splitFaqText } from "./split.ts";

const inflight = new Map<string, Promise<Game | null>>();

/** Fetch the best GameFAQs FAQ for `slug` and store it as a game. */
export function ensureFaqGame(
  slug: string,
  titleHint?: string,
): Promise<Game | null> {
  const running = inflight.get(slug);
  if (running) return running;
  const job = run(slug, titleHint).finally(() => inflight.delete(slug));
  inflight.set(slug, job);
  return job;
}

async function run(slug: string, titleHint?: string): Promise<Game | null> {
  const existing = await getGameBySlug(slug);
  if (existing) return existing;

  const hint = (titleHint ?? "").trim();
  const query = hint.length >= 2 ? hint : deriveTitleFromSlug(slug);

  let payload: FaqPayload | null = null;
  try {
    payload = await fetchFaqBest(query);
  } catch {
    if (!isNative()) return null;
    // Android: the invisible fetch failed (e.g. a Cloudflare check) — open
    // the in-app browser so the page can be solved/captured by hand.
    try {
      payload = await fetchFaqCapture(query);
    } catch {
      return null;
    }
  }
  if (!payload || !payload.text) return null;

  const parts = splitFaqText(payload.text);
  if (parts.length === 0) return null;

  const title = (payload.gameTitle ?? "").trim() || query;
  const author = (payload.author ?? "").trim();
  const faqTitle = (payload.faqTitle ?? "").trim() || "Walkthrough";
  const description = `Walkthrough dari GameFAQs — FAQ “${faqTitle}”${
    author ? ` oleh ${author}` : ""
  }, diambil otomatis.`;

  await upsertGame({
    slug,
    title,
    platform: null,
    year: null,
    coverUrl: null,
    description,
    wikiName: "gamefaqs.gamespot.com",
    sourceUrl: payload.sourceUrl || null,
  });
  await replaceSections(slug, faqSectionsToRows(parts, payload.sourceUrl));
  return getGameBySlug(slug);
}
