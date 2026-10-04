import { NextRequest, NextResponse } from "next/server";
import { db, initDb, projetReferenceValide } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, texte } from "@/lib/requete";

const c: any = () => db();

export async function GET(req: NextRequest) {
  await initDb();
  const sp = req.nextUrl.searchParams;
  let sql = "SELECT * FROM notes_rapides";
  const args: any[] = [];
  if (sp.get("projet_id") !== null) {
    const projet_id = idEntier(sp.get("projet_id"));
    if (!projet_id) return NextResponse.json({ error: "projet_id invalide" }, { status: 400 });
    sql += " WHERE projet_id = ?"; args.push(projet_id);
  } else if (sp.get("client_id") !== null) {
    const client_id = idEntier(sp.get("client_id"));
    if (!client_id) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
    sql += " WHERE client_id = ?"; args.push(client_id);
  }
  sql += " ORDER BY date_creation DESC LIMIT 50";
  const r = await c().execute({ sql, args });
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const texteNote = texte(b.texte, 5000);
  if (!texteNote) return NextResponse.json({ error: "texte requis" }, { status: 400 });
  // Même garde-fou que les autres écritures rattachées à un chantier : une note pointant
  // sur un projet inexistant ne s'afficherait nulle part et serait perdue d'avance.
  if (!(await projetReferenceValide(b.projet_id))) {
    return NextResponse.json({ error: "projet introuvable" }, { status: 400 });
  }
  const projet_id = b.projet_id ? idEntier(b.projet_id) : null;
  const client_id = b.client_id ? idEntier(b.client_id) : null;
  if ((b.projet_id && !projet_id) || (b.client_id && !client_id)) {
    return NextResponse.json({ error: "id invalide" }, { status: 400 });
  }
  const auteur = (await utilisateurActif(req)) || "?";
  const r = await c().execute({
    sql: "INSERT INTO notes_rapides (projet_id, client_id, texte, source, auteur, date_creation) VALUES (?,?,?,?,?,?)",
    args: [projet_id, client_id, texteNote, texte(b.source, 40) || "manuel", auteur, new Date().toISOString()],
  });
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function DELETE(req: NextRequest) {
  await initDb();
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const r = await c().execute({ sql: "DELETE FROM notes_rapides WHERE id = ?", args: [id] });
  if (!r.rowsAffected) return NextResponse.json({ error: "note introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
