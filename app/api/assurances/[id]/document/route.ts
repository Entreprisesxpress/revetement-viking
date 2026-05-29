// Sert le document d'assurance (PDF/image) en binaire.
import { NextRequest, NextResponse } from "next/server";
import { getAssuranceDocument } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = await getAssuranceDocument(+id);
  if (!a || !a.document_data) return new NextResponse("Not found", { status: 404 });
  const m = String(a.document_data).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return new NextResponse("Invalid", { status: 500 });
  const mime = m[1] || a.document_type || "application/octet-stream";
  const buf = Buffer.from(m[2], "base64");
  const ext = (mime.split("/")[1] || "bin").split("+")[0];
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename="assurance-${id}.${ext}"`,
    },
  });
}
