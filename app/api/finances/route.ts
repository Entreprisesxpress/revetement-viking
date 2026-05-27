import { NextRequest, NextResponse } from "next/server";
import { finances } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const annee = +(req.nextUrl.searchParams.get("annee") || new Date().getFullYear());
    const data = await finances(annee);
    return NextResponse.json(data, {
      // Calcul lourd, mais données changent avec chaque saisie → cache court avec SWR
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (e: any) {
    console.error("[/api/finances]", e);
    return NextResponse.json({ error: e?.message || "erreur" }, { status: 500 });
  }
}
