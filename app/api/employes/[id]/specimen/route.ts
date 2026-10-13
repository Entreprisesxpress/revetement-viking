// Spécimen de chèque d'un employé, servi comme les autres fichiers (lib/fichier-http.ts :
// type validé, `nosniff`, jamais de HTML/SVG exécutable). Avant, l'écran l'ouvrait par
// `document.write("<img src=…>")` dans une fenêtre de même origine : une donnée forgée en
// base (via l'API) y exécutait du script avec la session de celui qui cliquait.
import { NextRequest, NextResponse } from "next/server";
import { getEmploye } from "@/lib/db";
import { idEntier } from "@/lib/requete";
import { reponseFichier } from "@/lib/fichier-http";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = idEntier((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const e: any = await getEmploye(id);
  if (!e || !e.specimen_cheque_data) return new NextResponse("Not found", { status: 404 });
  const m = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(e.specimen_cheque_data));
  if (!m) return new NextResponse("Invalid data", { status: 404 });
  const buf = Buffer.from(m[2], "base64");
  return reponseFichier(buf, { type: e.specimen_cheque_type || m[1], nom: `specimen-${String(e.nom || id).replace(/\s+/g, "-")}`, cacheSecondes: 0 });
}
