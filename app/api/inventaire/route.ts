import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";

const c: any = () => db();

export async function GET(req: NextRequest) {
  await initDb();
  const emplacement = req.nextUrl.searchParams.get("emplacement");
  const sql = emplacement
    ? "SELECT * FROM inventaire WHERE emplacement = ? ORDER BY nom"
    : "SELECT * FROM inventaire ORDER BY emplacement, nom";
  const r = await c().execute({ sql, args: emplacement ? [emplacement] : [] });
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  await initDb();
  const b = await req.json();
  if (!b.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
  // `+b.quantite || 0` laissait passer une quantité négative (-5 || 0 === -5 en JS) :
  // on créait un item déjà en stock négatif. Même garde que sur les retraits.
  if (b.quantite !== undefined && (Number.isNaN(+b.quantite) || +b.quantite < 0)) {
    return NextResponse.json({ error: "quantité invalide (doit être ≥ 0)" }, { status: 400 });
  }
  const r = await c().execute({
    sql: "INSERT INTO inventaire (nom, categorie, quantite, unite, emplacement, photo_data, photo_type, notes, cout_unit, date_creation, date_modif) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    args: [b.nom, b.categorie || null, +b.quantite || 0, b.unite || "u", b.emplacement || null, b.photo_data || null, b.photo_type || null, b.notes || null, b.cout_unit ? +b.cout_unit : null, new Date().toISOString(), new Date().toISOString()],
  });
  return NextResponse.json({ ok: true, id: Number(r.lastInsertRowid) });
}

export async function PATCH(req: NextRequest) {
  await initDb();
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  // Si on modifie la quantité, journaliser le mouvement
  if (typeof b.delta === "number" && b.delta !== 0) {
    const par = (await utilisateurActif(req)) || "?";
    // Garde stock : refuse une sortie plus grande que le stock (avant : quantité négative
    // acceptée en silence, ex. 3 en stock − 10 = −7).
    if (b.delta < 0) {
      const cur = await c().execute({ sql: "SELECT quantite FROM inventaire WHERE id = ?", args: [b.id] });
      const q = Number((cur.rows[0] as any)?.quantite || 0);
      if (q + b.delta < 0) return NextResponse.json({ error: `Stock insuffisant : ${q} en inventaire, retrait de ${-b.delta} demandé.` }, { status: 400 });
    }
    await c().execute({ sql: "UPDATE inventaire SET quantite = quantite + ?, date_modif = ? WHERE id = ?", args: [b.delta, new Date().toISOString(), b.id] });
    await c().execute({
      sql: "INSERT INTO inventaire_mouvements (inventaire_id, delta, type, note, par, date_creation) VALUES (?,?,?,?,?,?)",
      args: [b.id, b.delta, b.delta > 0 ? "entree" : "sortie", b.note || null, par, new Date().toISOString()],
    });
    return NextResponse.json({ ok: true });
  }
  // Sinon, mise à jour des champs. La quantité saisie ici contourne le chemin `delta`
  // (et sa journalisation), mais elle ne doit pas davantage pouvoir devenir négative.
  if (b.quantite !== undefined && (Number.isNaN(+b.quantite) || +b.quantite < 0)) {
    return NextResponse.json({ error: "quantité invalide (doit être ≥ 0)" }, { status: 400 });
  }

  // VERROU OPTIMISTE sur la quantité. Le modal « Modifier » renvoie toujours `quantite`,
  // même si l'utilisateur n'a touché qu'au nom : sans ce garde, ouvrir la fiche puis
  // enregistrer écrasait en silence un retrait fait entre-temps par quelqu'un d'autre,
  // et sans laisser la moindre ligne dans inventaire_mouvements.
  let ajustement: { avant: number; apres: number } | null = null;
  if (b.quantite !== undefined) {
    const cur = await c().execute({ sql: "SELECT quantite FROM inventaire WHERE id = ?", args: [b.id] });
    if (!cur.rows.length) return NextResponse.json({ error: "item introuvable" }, { status: 404 });
    const actuelle = Number((cur.rows[0] as any).quantite || 0);
    const voulue = +b.quantite;
    if (b.quantite_connue !== undefined && Number(b.quantite_connue) !== actuelle) {
      return NextResponse.json({
        error: `La quantité a changé pendant que tu modifiais la fiche : elle est passée de ${b.quantite_connue} à ${actuelle}. Rouvre la fiche pour repartir de la bonne valeur.`,
        conflit: true, quantite_actuelle: actuelle,
      }, { status: 409 });
    }
    if (voulue !== actuelle) ajustement = { avant: actuelle, apres: voulue };
  }

  const champs = ["nom", "categorie", "quantite", "unite", "emplacement", "photo_data", "photo_type", "notes", "cout_unit"];
  const sets: string[] = [], args: any[] = [];
  for (const k of champs) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(b[k]); }
  if (!sets.length) return NextResponse.json({ error: "rien a modifier" }, { status: 400 });
  sets.push("date_modif = ?"); args.push(new Date().toISOString());
  args.push(b.id);
  await c().execute({ sql: `UPDATE inventaire SET ${sets.join(", ")} WHERE id = ?`, args });

  // Un changement de quantité par l'écran d'édition laisse maintenant une trace, au même
  // titre qu'une entrée/sortie — sinon un saut de stock restait inexplicable.
  if (ajustement) {
    const par = (await utilisateurActif(req)) || "?";
    await c().execute({
      sql: "INSERT INTO inventaire_mouvements (inventaire_id, delta, type, note, par, date_creation) VALUES (?,?,?,?,?,?)",
      args: [b.id, ajustement.apres - ajustement.avant, "ajustement",
             `Correction par la fiche : ${ajustement.avant} → ${ajustement.apres}`, par, new Date().toISOString()],
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  await initDb();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await c().execute({ sql: "DELETE FROM inventaire_mouvements WHERE inventaire_id = ?", args: [+id] });
  await c().execute({ sql: "DELETE FROM inventaire WHERE id = ?", args: [+id] });
  return NextResponse.json({ ok: true });
}
