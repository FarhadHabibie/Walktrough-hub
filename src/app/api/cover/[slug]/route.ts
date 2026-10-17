import { NextRequest } from "next/server";
import { getGameBySlug } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cover-image proxy.
 *
 * Some community wikis block hotlinking — or the Next.js image optimizer's
 * user agent, which shows up as blank covers (e.g. stardewvalleywiki.com
 * answers the optimizer with 403). Fetching the image from our own server
 * with sane headers fixes that. The URL is slug-based (no arbitrary URL
 * input), so this cannot be abused as an open proxy.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const game = getGameBySlug(slug);
  const src = game?.cover_url;
  if (!src || !/^https:\/\//i.test(src)) {
    return new Response("no cover", { status: 404 });
  }

  try {
    const url = new URL(src);
    if (url.protocol !== "https:") {
      return new Response("no cover", { status: 404 });
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent": "WalkthroughHub/0.1 (personal project; local dev)",
        Referer: url.origin + "/",
        Accept: "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !res.body) {
      return new Response("upstream error", { status: 502 });
    }
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) {
      return new Response("not an image", { status: 502 });
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control":
          "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("fetch failed", { status: 502 });
  }
}
