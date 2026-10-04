import { NextRequest, NextResponse, after } from "next/server";
import { db, initDb } from "@/lib/db";
import { nombreSaisi } from "@/lib/calculs";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, bool01, texte } from "@/lib/requete";

const c: any = () => db();

/** Normalise les champs numériques du corps AVANT toute écriture. Sans ça, « 12,50 »
 *  (virgule québécoise) était stocké tel quel : SQLite le garde en TEXTE (l'affinité REAL
 *  ne convertit que « 12.50 »), et tout calcul de prix de vente donnait ensuite NaN.
 *  Retourne un message d'erreur si une valeur fournie est illisible ou négative. */
function normaliserNombres(b: any): string | null {
  for (const k of ["prix_coutant", "prix_vente", "majoration_pct", "format_paquet"]) {
    if (b[k] === undefined || b[k] === null || b[k] === "") continue;
    const n = nombreSaisi(b[k]);
    if (!Number.isFinite(n) || n < 0) return `${k} invalide (ex. : 12,50)`;
    b[k] = n;
  }
  return null;
}

function calculerPrixVente(coutant: number | null, majPct: number | null): number | null {
  if (coutant == null || coutant <= 0) return null;
  const m = majPct == null ? 20 : majPct;
  return Math.round(coutant * (1 + m / 100) * 100) / 100;
}

export async function GET(req: NextRequest) {
  await initDb();
  const type = req.nextUrl.searchParams.get("type");
  const fournisseur = req.nextUrl.searchParams.get("fournisseur");
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();

  let sql = "SELECT * FROM catalogue_materiaux WHERE actif = 1";
  const args: any[] = [];
  if (type) { sql += " AND type = ?"; args.push(type); }
  if (fournisseur) { sql += " AND fournisseur = ?"; args.push(fournisseur); }
  sql += " ORDER BY type, fournisseur, nom";
  const r = await c().execute({ sql, args });
  let rows = r.rows;
  if (q) rows = (rows as any[]).filter((m) => `${m.nom} ${m.type} ${m.fournisseur} ${m.notes || ""}`.toLowerCase().includes(q));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const nombreInvalide = normaliserNombres(b);
  if (nombreInvalide) return NextResponse.json({ error: nombreInvalide }, { status: 400 });
  b.nom = texte(b.nom, 200);
  if (!b.nom || !b.unite) return NextResponse.json({ error: "nom + unite requis" }, { status: 400 });
  const prix_vente = b.prix_vente != null ? +b.prix_vente : calculerPrixVente(b.prix_coutant ?? null, b.majoration_pct ?? null);
  const r = await c().execute({
    sql: `INSERT INTO catalogue_materiaux
          (nom, type, fournisseur, unite, format_paquet, format_paquet_label, prix_coutant, majoration_pct, prix_vente, notes, actif, date_creation, date_modif)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      b.nom, b.type || null, b.fournisseur || null, b.unite,
      b.format_paquet ? +b.format_paquet : null,
      b.format_paquet_label || null,
      b.prix_coutant != null ? +b.prix_coutant : null,
      b.majoration_pct != null ? +b.majoration_pct : 20,
      prix_vente,
      b.notes || null,
      b.actif === 0 ? 0 : 1,
      new Date().toISOString(), new Date().toISOString(),
    ],
  });
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function PATCH(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const nombreInvalide = normaliserNombres(b);
  if (nombreInvalide) return NextResponse.json({ error: nombreInvalide }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (b.nom !== undefined) {
    b.nom = texte(b.nom, 200);
    if (!b.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
  }
  if (b.actif !== undefined) b.actif = bool01(b.actif);
  // Recalcul prix_vente si coutant ou majoration change
  if (b.prix_coutant != null || b.majoration_pct != null) {
    if (b.prix_vente == null) {
      // Lire l'existant pour combiner
      const cur = await c().execute({ sql: "SELECT prix_coutant, majoration_pct FROM catalogue_materiaux WHERE id = ?", args: [id] });
      const old = cur.rows[0] as any;
      if (!old) return NextResponse.json({ error: "article introuvable" }, { status: 404 });
      const cout = b.prix_coutant ?? old?.prix_coutant;
      const maj = b.majoration_pct ?? old?.majoration_pct;
      b.prix_vente = calculerPrixVente(cout, maj);
    }
  }
  const champs = ["nom", "type", "fournisseur", "unite", "format_paquet", "format_paquet_label", "prix_coutant", "majoration_pct", "prix_vente", "notes", "actif"];
  const sets: string[] = [], args: any[] = [];
  for (const k of champs) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k]); }
  if (!sets.length) return NextResponse.json({ error: "rien a modifier" }, { status: 400 });
  sets.push("date_modif = ?"); args.push(new Date().toISOString());
  args.push(id);
  const r = await c().execute({ sql: `UPDATE catalogue_materiaux SET ${sets.join(", ")} WHERE id = ?`, args });
  if (!r.rowsAffected) return NextResponse.json({ error: "article introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await initDb();
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  // Soft delete : on désactive plutôt que supprimer (pour préserver l'historique des soumissions)
  const cur = await c().execute({ sql: "SELECT id, nom, type, fournisseur, unite, prix_coutant, prix_vente, actif FROM catalogue_materiaux WHERE id = ?", args: [id] });
  const avant = (cur.rows[0] as any) || null;
  if (!avant) return NextResponse.json({ error: "article introuvable" }, { status: 404 });
  await c().execute({ sql: "UPDATE catalogue_materiaux SET actif = 0, date_modif = ? WHERE id = ?", args: [new Date().toISOString(), id] });
  const user = await utilisateurActif(req);
  // Journal APRÈS la réponse (after) : une promesse simplement détachée pouvait être
  // tuée avec la fonction serverless dès la réponse rendue.
  after(() => journaliser("catalogue.desactive", {
    ref_type: "catalogue", ref_id: id, utilisateur: user || undefined,
    description: `${avant.nom} · ${avant.fournisseur || "?"} · ${avant.prix_vente ?? "—"} $/${avant.unite || "u"}`,
    avant,
  }));
  return NextResponse.json({ ok: true });
}
