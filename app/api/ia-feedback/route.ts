import { NextRequest, NextResponse } from "next/server";
import { enregistrerFeedback } from "@/lib/viking-ai";
import { utilisateurActif } from "@/lib/authUser";
import { lireCorps } from "@/lib/requete";

/** POST : enregistre le diff entre version IA initiale et version humaine finale.
 *  (L'ancien GET « debug » qui renvoyait le résumé des corrections n'avait aucun appelant.) */
export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  if (!b.numero || !b.avant || !b.apres) return NextResponse.json({ error: "numero, avant, apres requis" }, { status: 400 });
  const par = (await utilisateurActif(req)) || "?";
  await enregistrerFeedback({ numero: String(b.numero).slice(0, 60), avant: b.avant, apres: b.apres, par });
  return NextResponse.json({ ok: true });
}
