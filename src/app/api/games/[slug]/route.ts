import { NextRequest, NextResponse } from "next/server";
import { deleteGame } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/games/:slug — hapus walkthrough tersimpan (game + section). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "missing slug" },
      { status: 400 },
    );
  }
  const deleted = deleteGame(slug);
  if (!deleted) {
    return NextResponse.json(
      { ok: false, error: "not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, slug });
}
