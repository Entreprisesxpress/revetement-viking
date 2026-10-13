import { NextRequest, NextResponse } from "next/server";
import { finances } from "@/lib/db";
import { aujourdhuiMontreal } from "@/lib/date";
import { entierBorne } from "@/lib/requete";

export async function GET(req: NextRequest) {
  try {
    // Année de MONTRÉAL : en UTC, le 31 décembre dès 19 h l'écran Finances passait à
    // l'année suivante (vide).
    const annee = entierBorne(req.nextUrl.searchParams.get("annee"), Number(aujourdhuiMontreal().slice(0, 4)), 2000, 2100);
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
