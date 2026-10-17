import { NextRequest } from "next/server";
import { searchGames } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const games = searchGames(q, 10);
  return Response.json({
    query: q,
    results: games.map((g) => ({
      slug: g.slug,
      title: g.title,
      platform: g.platform,
      year: g.year,
      cover_url: g.cover_url,
      section_count: g.section_count,
    })),
  });
}
