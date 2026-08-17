import { NextRequest, NextResponse } from "next/server";
import { getFichierProjet } from "@/lib/db";

export const dynamic = "force-dynamic";

// Types qu'on laisse s'afficher dans l'onglet. Tout le reste est forcé en téléchargement :
// on ne laisse pas le navigateur interpréter un fichier arbitraire dans le contexte du site.
const AFFICHABLES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain",
]);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const f = await getFichierProjet(+id);
  if (!f || !f.data) return new NextResponse("Not found", { status: 404 });
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(String(f.data));
  if (!m) return new NextResponse("Invalid data", { status: 500 });
  const type = f.type || m[1] || "application/octet-stream";
  const buf = Buffer.from(m[2], "base64");
  const affichable = AFFICHABLES.has(type);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": affichable ? type : "application/octet-stream",
      "Content-Length": String(buf.length),
      // Document de chantier derrière l'authentification : jamais mis en cache par un
      // intermédiaire. (Les fichiers clients, eux, sont marqués publics — c'est une
      // divergence connue de cette route, volontaire.)
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${affichable ? "inline" : "attachment"}; filename="${(f.nom || "document").replace(/[^a-z0-9._ ()-]/gi, "_")}"`,
    },
  });
}
