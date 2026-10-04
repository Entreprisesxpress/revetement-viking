import { reponseFichier, extensionDe } from "@/lib/fichier-http";
// Sert le reçu binaire (PDF/JPG) avec cache HTTP agressif
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { idEntier } from "@/lib/requete";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = idEntier((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const c = db();
  const r = await c.execute({ sql: `SELECT recu_data, recu_type FROM depenses_projet WHERE id = ?`, args: [id] });
  const row: any = r.rows[0];
  if (!row || !row.recu_data) return new NextResponse("Not found", { status: 404 });
  const m = String(row.recu_data).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return new NextResponse("Invalid", { status: 500 });
  const mime = m[1] || row.recu_type || "application/octet-stream";
  const buf = Buffer.from(m[2], "base64");
  // Type déclaré au dépôt jamais servi tel quel en inline — voir lib/fichier-http.ts.
  return reponseFichier(buf, { type: mime, nom: `recu-${id}.${extensionDe(mime)}`, cacheSecondes: 2592000 });
}
