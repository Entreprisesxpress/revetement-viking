import { reponseFichier, extensionDe } from "@/lib/fichier-http";
import { NextRequest, NextResponse } from "next/server";
import { getFichierProjet } from "@/lib/db";

export const dynamic = "force-dynamic";

// Types qu'on laisse s'afficher dans l'onglet. Tout le reste est forcé en téléchargement :
// on ne laisse pas le navigateur interpréter un fichier arbitraire dans le contexte du site.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = await getFichierProjet(+id);
  if (!f || !f.data) return new NextResponse("Not found", { status: 404 });
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(String(f.data));
  if (!m) return new NextResponse("Invalid data", { status: 500 });
  const type = f.type || m[1] || "application/octet-stream";
  const buf = Buffer.from(m[2], "base64");
  // Cette route avait déjà la bonne règle (liste blanche + attachment + nosniff) ; elle est
  // maintenant partagée par les six routes de fichiers — lib/fichier-http.ts.
  return reponseFichier(buf, { type, nom: f.nom || "document", cacheSecondes: 3600 });
}
