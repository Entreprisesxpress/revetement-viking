import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { idEntier, lireCorps, bool01, texte } from "@/lib/requete";

const c: any = () => db();

export async function GET() {
  await initDb();
  const r = await c().execute({ sql: "SELECT * FROM cameras WHERE actif = 1 ORDER BY ordre, id", args: [] });
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const nom = texte(b.nom, 200);
  if (!nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
  const r = await c().execute({
    sql: "INSERT INTO cameras (nom, emplacement, url_embed, type, actif, ordre, date_creation) VALUES (?,?,?,?,?,?,?)",
    args: [nom, texte(b.emplacement, 200) || null, texte(b.url_embed, 2000) || null, texte(b.type, 40) || "iframe", 1, b.ordre || 0, new Date().toISOString()],
  });
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function PATCH(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  // `actif` coercé en 0/1 : « abc » ou « false » entraient tels quels et la caméra
  // disparaissait de la liste (WHERE actif = 1) ou y restait, sans logique visible.
  if (b.actif !== undefined) b.actif = bool01(b.actif);
  const sets: string[] = [], args: any[] = [];
  for (const k of ["nom", "emplacement", "url_embed", "type", "actif", "ordre"]) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k]); }
  if (!sets.length) return NextResponse.json({ error: "rien" }, { status: 400 });
  args.push(id);
  const r = await c().execute({ sql: `UPDATE cameras SET ${sets.join(", ")} WHERE id = ?`, args });
  if (!r.rowsAffected) return NextResponse.json({ error: "caméra introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await initDb();
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const r = await c().execute({ sql: "DELETE FROM cameras WHERE id = ?", args: [id] });
  if (!r.rowsAffected) return NextResponse.json({ error: "caméra introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
