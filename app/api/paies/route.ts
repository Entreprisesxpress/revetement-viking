import { NextRequest, NextResponse, after } from "next/server";
import { db, listerPaiePeriodes, marquerPayePeriode, supprimerPayePeriode, nettoyerPayePeriodesOrphelines, definirBanqueAppliquee } from "@/lib/db";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";
import { nombreSaisi } from "@/lib/calculs";
import { validerDate } from "@/lib/validation-argent";
import { idEntier, lireCorps, entierBorne, texte } from "@/lib/requete";

/** La période telle qu'elle est en base (pour l'avant/après du journal d'audit). */
async function lirePeriode(id: number): Promise<any | null> {
  const r = await db().execute({
    sql: "SELECT id, employe, debut, fin, heures_normales, heures_travaillees, taux_horaire, das_pct, montant_brut, das_montant, montant_net, paye, date_paiement, note, banque_dispo, banque_appliquee, banque_solde FROM paies_periodes WHERE id = ?",
    args: [id],
  });
  return (r.rows[0] as any) || null;
}

export async function GET(req: NextRequest) {
  const employe = req.nextUrl.searchParams.get("employe") || undefined;
  // `limit=abc` donnait LIMIT NaN (liste vide, sans erreur) : borné et avec défaut.
  const limit = entierBorne(req.nextUrl.searchParams.get("limit"), 12, 1, 500);
  return NextResponse.json(await listerPaiePeriodes(employe, limit));
}

export async function PATCH(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const user = await utilisateurActif(req);
  const avant = await lirePeriode(id);
  if (!avant) return NextResponse.json({ error: "période introuvable" }, { status: 404 });
  // Choix utilisateur : combler la période avec des heures de la banque
  if (b.banque_appliquee !== undefined) {
    // Mesuré : `banque_appliquee: "abc"` répondait ok et remettait la banque à 0 (NaN → 0).
    const heures = nombreSaisi(b.banque_appliquee);
    if (!Number.isFinite(heures) || heures < 0) return NextResponse.json({ error: "banque_appliquee invalide (nombre d'heures ≥ 0, ex. : 7,5)" }, { status: 400 });
    if (avant.paye) return NextResponse.json({ error: "période payée", message: "Cette période est déjà marquée payée : la banque appliquée ne se change plus." }, { status: 409 });
    if (!(await definirBanqueAppliquee(id, heures))) return NextResponse.json({ error: "période introuvable" }, { status: 404 });
    after(() => journaliser("paye.banque_appliquee", {
      ref_type: "paye", ref_id: id, utilisateur: user || undefined,
      description: `${avant.employe} · ${avant.debut} → ${avant.fin} · banque appliquée ${avant.banque_appliquee ?? 0} h → ${heures} h`,
      avant: { banque_appliquee: avant.banque_appliquee, banque_dispo: avant.banque_dispo, paye: avant.paye },
      apres: { banque_appliquee: heures },
    }));
    return NextResponse.json({ ok: true });
  }
  // Date de versement : AAAA-MM-JJ réelle (une date libre entrait telle quelle et sortait
  // de tous les filtres de période). Absente → date du jour (marquerPayePeriode).
  const dateInvalide = validerDate(b.date_paiement, "date_paiement");
  if (dateInvalide) return NextResponse.json({ error: dateInvalide }, { status: 400 });
  const note = texte(b.note, 500) || undefined;
  // Idempotent : une période déjà payée ne se remarque pas payée (sinon la date de
  // versement était écrasée par la date du jour). 409 avec le motif.
  const marque = await marquerPayePeriode(id, !!b.paye, b.date_paiement || undefined, note);
  if (!marque.ok) return NextResponse.json({ error: "déjà payée", message: marque.raison }, { status: 409 });
  const apres = await lirePeriode(id);
  // Argent versé à un employé : la trace porte le brut, la DAS et le net tels qu'ils sont
  // au moment du geste — c'est ce qui figure sur le talon.
  after(() => journaliser("paye.marquee_payee", {
    ref_type: "paye", ref_id: id, utilisateur: user || undefined,
    description: `${avant.employe} · ${avant.debut} → ${avant.fin} · ${b.paye ? "marquée PAYÉE" : "paiement ANNULÉ"} · brut ${avant.montant_brut ?? "?"} $`,
    avant: { paye: avant.paye, date_paiement: avant.date_paiement, note: avant.note, heures_normales: avant.heures_normales, taux_horaire: avant.taux_horaire, montant_brut: avant.montant_brut, das_montant: avant.das_montant, montant_net: avant.montant_net },
    apres: apres ? { paye: apres.paye, date_paiement: apres.date_paiement, note: apres.note, heures_normales: apres.heures_normales, taux_horaire: apres.taux_horaire, montant_brut: apres.montant_brut, das_montant: apres.das_montant, montant_net: apres.montant_net } : null,
  }));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const user = await utilisateurActif(req);
  if (sp.get("orphelines") === "1") {
    const n = await nettoyerPayePeriodesOrphelines();
    if (n > 0) after(() => journaliser("paye.periode_supprimee", { ref_type: "paye", utilisateur: user || undefined, description: `Nettoyage : ${n} période(s) orpheline(s) supprimée(s)` }));
    return NextResponse.json({ ok: true, supprimees: n });
  }
  const id = idEntier(sp.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const avant = await lirePeriode(id);
  // Une période VERSÉE ne se supprime pas (talon remis, banque d'heures en aval) : 409.
  const supp = await supprimerPayePeriode(id);
  if (!supp.ok) return NextResponse.json({ error: "suppression refusée", message: supp.raison }, { status: supp.raison?.includes("introuvable") ? 404 : 409 });
  after(() => journaliser("paye.periode_supprimee", {
    ref_type: "paye", ref_id: id, utilisateur: user || undefined,
    description: avant ? `${avant.employe} · ${avant.debut} → ${avant.fin} · ${avant.paye ? "PAYÉE" : "non payée"} · brut ${avant.montant_brut ?? "?"} $` : `Période #${id}`,
    avant,
  }));
  return NextResponse.json({ ok: true });
}
