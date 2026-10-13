import { NextRequest, NextResponse } from "next/server";
import { listerActivites, metaActivites } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // `?meta=1` : liste DISTINCT des types + total (pour le menu et le bandeau « 200 sur N »).
  if (sp.get("meta") === "1") {
    return NextResponse.json(await metaActivites({ type: sp.get("type") || undefined }));
  }
  return NextResponse.json(
    await listerActivites({
      type: sp.get("type") || undefined,
      ref_type: sp.get("ref_type") || undefined,
      ref_id: sp.get("ref_id") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : 200,
    })
  );
}
