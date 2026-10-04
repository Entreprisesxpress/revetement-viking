import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, bool01, texte } from "@/lib/requete";

const c: any = () => db();

export async function GET(req: NextRequest) {
  await initDb();
  // Liste : NE PAS retourner data_b64 (lourd) — juste les métadonnées
  const r = await c().execute({
    sql: "SELECT id, nom, type_mime, taille, contenu_texte IS NOT NULL AS a_texte, tags, actif, par, date_creation FROM documents_ia ORDER BY date_creation DESC",
    args: [],
  });
  return NextResponse.json(r.rows);
}

// Contrôle de type AU DÉPÔT : l'écran envoie toujours un data URL (FileReader). Liste
// blanche = ce que l'écran /parametres-ia propose (PDF, image, CSV, Excel — les listes de
// prix que l'IA consulte) ; tout ce qui pourrait s'exécuter dans un navigateur (HTML, SVG,
// script) est refusé. Le type stocké est celui du data URL, pas le `type_mime` déclaré à
// part par le client.
const TYPE_DOCUMENT_OK = /^data:(application\/pdf|image\/(jpeg|png|webp|heic|gif)|text\/(csv|plain)|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet);base64,/i;

export async function POST(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const nom = texte(b.nom, 200);
  if (!nom || !b.data_b64) return NextResponse.json({ error: "nom + data_b64 requis" }, { status: 400 });
  const m = typeof b.data_b64 === "string" ? b.data_b64.match(TYPE_DOCUMENT_OK) : null;
  if (!m) return NextResponse.json({ error: "document refusé : seuls un PDF, une image (JPEG, PNG, WebP, HEIC), un CSV ou un classeur Excel sont acceptés" }, { status: 400 });
  const par = (await utilisateurActif(req)) || "?";
  const r = await c().execute({
    sql: "INSERT INTO documents_ia (nom, type_mime, taille, data_b64, contenu_texte, tags, actif, par, date_creation) VALUES (?,?,?,?,?,?,?,?,?)",
    args: [nom, m[1].toLowerCase(), b.taille || 0, b.data_b64, b.contenu_texte || null, texte(b.tags, 500) || null, 1, par, new Date().toISOString()],
  });
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function PATCH(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (b.nom !== undefined) {
    b.nom = texte(b.nom, 200);
    if (!b.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
  }
  if (b.tags !== undefined) b.tags = texte(b.tags, 500);
  // `actif` coercé en 0/1 : l'IA ne consulte que les documents actifs, une valeur
  // « abc » stockée telle quelle sortait le document du corpus sans le dire.
  if (b.actif !== undefined) b.actif = bool01(b.actif);
  const sets: string[] = [], args: any[] = [];
  for (const k of ["nom", "tags", "actif", "contenu_texte"]) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k]); }
  if (!sets.length) return NextResponse.json({ error: "rien" }, { status: 400 });
  args.push(id);
  const r = await c().execute({ sql: `UPDATE documents_ia SET ${sets.join(", ")} WHERE id = ?`, args });
  if (!r.rowsAffected) return NextResponse.json({ error: "document introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await initDb();
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const r = await c().execute({ sql: "DELETE FROM documents_ia WHERE id = ?", args: [id] });
  if (!r.rowsAffected) return NextResponse.json({ error: "document introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
