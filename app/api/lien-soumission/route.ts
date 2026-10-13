// Génère le lien public signé pour une soumission (authentifié — derrière middleware).
import { NextRequest, NextResponse } from "next/server";
import { genererTokenSoumission } from "@/lib/lien-public";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");
    if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    const token = await genererTokenSoumission(numero);
    // Origine PUBLIQUE (APP_PUBLIC_URL, sinon l'hôte transmis) : `req.nextUrl.origin`
    // donnait l'hôte interne derrière un proxy.
    const origin = publicOrigin(req);
    const url = `${origin}/soumission/${encodeURIComponent(numero)}?t=${token}`;
    return NextResponse.json({ url, token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "erreur" }, { status: 500 });
  }
}
