import { NextRequest, NextResponse } from "next/server";
import { charger } from "@/lib/db";
import { calculerSoumission } from "@/lib/calculateur";
import { MATERIAUX } from "@/data/materiaux";

/** GET /api/soumissions/materiaux?numero=XXX
 *  Liste de matériaux à commander pour une soumission.
 *
 *  La route lisait `payload.articles`, une clé qui n'a jamais existé : le formulaire
 *  enregistre `payload.lignes` ([{ materiauCode, quantite, surplus, margePct }]). La liste
 *  ressortait donc TOUJOURS vide, avec un total de 0 $, pour toutes les soumissions.
 *
 *  On repasse maintenant par calculerSoumission (le même calcul que le formulaire et le
 *  PDF), ce qui donne en prime la quantité RÉELLEMENT à commander — en formats entiers,
 *  boîtes/paquets, surplus inclus — plutôt que la quantité brute mesurée. */
export async function GET(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");
    if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "introuvable" }, { status: 404 });

    let payload: any = {};
    try { payload = JSON.parse(s.payload_json || "{}"); } catch { payload = {}; }
    const lignes: any[] = Array.isArray(payload.lignes) ? payload.lignes : [];

    // Codes inconnus (matériau retiré du catalogue depuis) : signalés au lieu d'être
    // silencieusement absents de la liste de commande.
    const inconnus = lignes
      .map((l) => l.materiauCode)
      .filter((code) => code && !MATERIAUX.some((m: any) => m.code === code));

    const calcul = calculerSoumission({
      lignes,
      fraisActifs: payload.fraisActifs || [],
      fraisGestion: payload.fraisGestion ?? 0,
      appliquerTaxes: !!payload.appliquerTaxes,
    } as any);

    // Agrège par matériau : deux lignes du même produit = une seule commande.
    // `quantite` / `unite` / `cout_unit` / `sous_total` gardent les noms attendus par
    // l'écran et l'export CSV ; les champs de commande viennent en plus.
    const map = new Map<string, {
      code: string; description: string; categorie: string; unite: string;
      quantite: number; quantite_avec_surplus: number;
      formats_a_commander: number; format: string;
      cout_unit: number; sous_total: number;
    }>();

    for (const lc of calcul.lignes as any[]) {
      const mat = lc.materiau;
      if (!mat) continue;
      const cat = String(mat.categorie || "").toLowerCase();
      // On ne commande pas de la main-d'œuvre.
      if (cat.includes("œuvre") || cat.includes("oeuvre") || cat.includes("service") || cat.includes("main")) continue;
      const cle = mat.code;
      if (!map.has(cle)) {
        map.set(cle, {
          code: mat.code, description: mat.nom, categorie: mat.categorie,
          unite: mat.uniteCalcul || "u",
          quantite: 0, quantite_avec_surplus: 0,
          formats_a_commander: 0, format: mat.formatVendu || `${mat.qtyParFormat} ${mat.uniteCalcul || "u"}`,
          cout_unit: mat.prixCoutantParFormat || 0, sous_total: 0,
        });
      }
      const m = map.get(cle)!;
      m.quantite += lc.quantiteBase || 0;
      m.quantite_avec_surplus += lc.quantiteAvecSurplus || 0;
      m.formats_a_commander += lc.formatACommander || 0;
      m.sous_total += lc.coutMateriau || 0;
    }

    const liste = Array.from(map.values()).sort(
      (a, b) => a.categorie.localeCompare(b.categorie) || a.description.localeCompare(b.description)
    );
    const total = liste.reduce((s, m) => s + m.sous_total, 0);

    return NextResponse.json({
      numero,
      client: payload.client?.nom || s.client_nom || "?",
      adresse: payload.client?.adresse || s.client_adresse || "",
      date: s.date_creation,
      liste,
      total,
      nb_articles: liste.length,
      ...(inconnus.length ? { avertissement: `${inconnus.length} ligne(s) ignorée(s) — matériau inconnu au catalogue : ${inconnus.join(", ")}` } : {}),
    });
  } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 500 }); }
}
