import { NextRequest, NextResponse } from "next/server";
import { getExtraPhoto } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const x = await getExtraPhoto(+id);
  const source = x?.thumb_data || x?.photo_data;
  if (!source) return new NextResponse("Not found", { status: 404 });
  const m = String(source).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return new NextResponse("Invalid data", { status: 500 });
  const buf = Buffer.from(m[2], "base64");
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
