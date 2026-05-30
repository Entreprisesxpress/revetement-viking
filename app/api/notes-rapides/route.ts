import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";

const c: any = () => db();

export async function GET(req: NextRequest) {
  await initDb();
  const projet_id = req.nextUrl.searchParams.get("projet_id");
  const client_id = req.nextUrl.searchParams.get("client_id");
  let sql = "SELECT * FROM notes_rapides";
  const args: any[] = [];
  if (projet_id) { sql += " WHERE projet_id = ?"; args.push(+projet_id); }
  else if (client_id) { sql += " WHERE client_id = ?"; args.push(+client_id); }
  sql += " ORDER BY date_creation DESC LIMIT 50";
  const r = await c().execute({ sql, args });
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  await initDb();
  const b = await req.json();
  if (!b.texte || !b.texte.trim()) return NextResponse.json({ error: "texte requis" }, { status: 400 });
  const auteur = (await utilisateurActif(req)) || "?";
  const r = await c().execute({
    sql: "INSERT INTO notes_rapides (projet_id, client_id, texte, source, auteur, date_creation) VALUES (?,?,?,?,?,?)",
    args: [b.projet_id || null, b.client_id || null, b.texte.trim(), b.source || "manuel", auteur, new Date().toISOString()],
  });
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function DELETE(req: NextRequest) {
  await initDb();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await c().execute({ sql: "DELETE FROM notes_rapides WHERE id = ?", args: [+id] });
  return NextResponse.json({ ok: true });
}
