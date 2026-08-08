import { NextRequest, NextResponse } from "next/server";
import { getPhotoBiblio } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Sert une photo de la bibliothèque de jobs (stockée en base). Route authentifiée :
 *  elle n'est pas dans l'allowlist publique de proxy.ts. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getPhotoBiblio(+id);
  if (!p?.data) return new NextResponse("Not found", { status: 404 });
  const m = String(p.data).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return new NextResponse("Invalid image", { status: 500 });
  const buf = Buffer.from(m[2], "base64");
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": m[1] || p.type || "image/jpeg",
      "Content-Length": String(buf.length),
      // Immuable : une photo ne change jamais après son enregistrement.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
