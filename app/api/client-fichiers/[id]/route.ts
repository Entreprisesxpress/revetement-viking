import { reponseFichier, extensionDe } from "@/lib/fichier-http";
import { NextRequest, NextResponse } from "next/server";
import { getFichierClient } from "@/lib/db";
import { idEntier } from "@/lib/requete";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = idEntier((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const f = await getFichierClient(id);
  if (!f || !f.data) return new NextResponse("Not found", { status: 404 });
  const m = String(f.data).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return new NextResponse("Invalid data", { status: 500 });
  const buf = Buffer.from(m[2], "base64");
  // Type déclaré au dépôt jamais servi tel quel en inline (voir lib/fichier-http.ts), et
  // cache `private` : ce fichier est derrière l'authentification — `public` laissait un
  // cache partagé le servir, et le navigateur le garder 30 jours après une déconnexion.
  return reponseFichier(buf, { type: f.type || m[1], nom: f.nom || "fichier", cacheSecondes: 2592000 });
}
