import { NextRequest, NextResponse, after } from "next/server";
import { listerContrats, getContrat, ajouterContrat, modifierContrat, supprimerContrat } from "@/lib/db";
import { validerEcritureArgent } from "@/lib/validation-argent";
import { nombreSaisi } from "@/lib/calculs";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, texte } from "@/lib/requete";

// Bornes partagées (mêmes que factures, dépenses, extras). Sans elles, un montant NaN ou
// aberrant entrait tel quel : un contrat à 0 $ ou à 1e21 faussait le CA et les dépôts.
const CHAMPS_MONTANT = ["montant_avant_taxes", "montant_total", "depot_montant", "taxes_pct", "depot_pct"];
const BORNES_CONTRAT = {
  champsMontant: CHAMPS_MONTANT,
  champsDate: ["date_emission", "date_debut_travaux", "date_fin_prevue", "date_signature"],
  refuserNegatif: true,
};

/** Valide puis CONVERTIT les montants en nombres avant l'écriture. Avant, la validation
 *  passait (nombreSaisi lit « 12 500,00 $ ») mais la chaîne brute était stockée : SQLite
 *  la gardait en TEXTE et les totaux qui la lisaient donnaient NaN.
 *  Les textes libres sont bornés (conditions et garantie peuvent être longs : 10 000). */
function validerEtNormaliser(b: any): string | null {
  const invalide = validerEcritureArgent(b, BORNES_CONTRAT);
  if (invalide) return invalide;
  for (const k of CHAMPS_MONTANT) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === "") { b[k] = null; continue; }
    b[k] = nombreSaisi(b[k]);
  }
  b.titre = texte(b.titre, 200);
  b.conditions = texte(b.conditions, 10_000);
  b.garantie = texte(b.garantie, 10_000);
  return null;
}

export async function GET(req: NextRequest) {
  const idBrut = req.nextUrl.searchParams.get("id");
  const statut = req.nextUrl.searchParams.get("statut");
  if (idBrut !== null) {
    const id = idEntier(idBrut);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const c = await getContrat(id);
    if (!c) return NextResponse.json({ error: "contrat introuvable" }, { status: 404 });
    return NextResponse.json(c);
  }
  return NextResponse.json(await listerContrats(statut || undefined));
}

export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const invalide = validerEtNormaliser(b);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  if (!b.titre || !b.date_emission) return NextResponse.json({ error: "titre + date_emission requis" }, { status: 400 });
  const r = await ajouterContrat(b);
  return NextResponse.json({ ok: true, ...r });
}

export async function PATCH(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const invalide = validerEtNormaliser(b);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  if (b.titre !== undefined && !b.titre) return NextResponse.json({ error: "titre requis" }, { status: 400 });
  if (!(await modifierContrat(id, b))) return NextResponse.json({ error: "contrat introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const user = await utilisateurActif(req);
  const avant = await getContrat(id);
  // Un contrat SIGNÉ par le client ne se supprime pas : 409 avec le motif.
  const supp = await supprimerContrat(id);
  if (!supp.ok) return NextResponse.json({ error: "suppression refusée", message: supp.raison }, { status: supp.raison?.includes("introuvable") ? 404 : 409 });
  after(() => journaliser("contrat.supprime", {
    ref_type: "contrat", ref_id: id, utilisateur: user || undefined,
    description: avant ? `${avant.numero} · ${avant.titre} · ${avant.montant_total ?? "—"} $` : `Contrat #${id}`,
    avant: avant ? { numero: avant.numero, titre: avant.titre, client_id: avant.client_id, projet_id: avant.projet_id, montant_total: avant.montant_total, statut: avant.statut } : null,
  }));
  return NextResponse.json({ ok: true });
}
