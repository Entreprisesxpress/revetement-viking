import { NextRequest, NextResponse, after } from "next/server";
import { listerFacturesProjet, ajouterFactureProjet, marquerFacturePayee, annulerPaiementFacture, supprimerFactureProjet, projetPourSaisie, numeroFactureExiste, doublonsDeLaPieceEnregistree, getFactureProjet } from "@/lib/db";
import { idEntier, lireCorps, texte } from "@/lib/requete";
import { aujourdhuiMontreal } from "@/lib/date";
import { nombreSaisi } from "@/lib/calculs";
import { validerEcritureArgent } from "@/lib/validation-argent";
// Aucun geste d'argent n'était tracé ici : « qui a marqué cette facture payée ? » ou
// « qui a supprimé cette facture ? » n'avait aucune réponse possible six mois plus tard.
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";

// Message GÉNÉRIQUE au client : le détail (chemin de fichier, SQL, nom de table) va dans
// le journal serveur, pas dans la réponse.
function fail(e: any, status = 500) { console.error("[/api/factures]", e); return NextResponse.json({ error: "Erreur serveur" }, { status }); }

export async function GET(req: NextRequest) {
  try {
    const projet_id = idEntier(req.nextUrl.searchParams.get("projet_id"));
    if (!projet_id) return NextResponse.json({ error: "projet_id invalide" }, { status: 400 });
    return NextResponse.json(await listerFacturesProjet(projet_id));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    // Montant : NOMBRE fini exigé (« abc » passait). Virgule décimale acceptée.
    // Négatif toléré (note de crédit).
    const montant = nombreSaisi(body.montant);
    const projetId = idEntier(body.projet_id);
    if (!projetId || !body.montant || !isFinite(montant) || !body.date) {
      return NextResponse.json({ error: "projet_id, montant (nombre) et date requis" }, { status: 400 });
    }
    body.projet_id = projetId;
    body.description = texte(body.description, 200);
    // Bornes partagées : sans elles, un 1e21 saisi ici faisait exploser le facturé, le
    // « à recevoir » et la marge du projet dans tous les écrans (mesuré).
    const invalide = validerEcritureArgent(body, { champsDate: ["date", "date_paiement", "date_echeance"] });
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    const ref = await projetPourSaisie(body.projet_id);
    if (!ref || !ref.existe) {
      return NextResponse.json({ error: "projet introuvable — la facture serait rattachée à un projet qui n'existe pas" }, { status: 400 });
    }
    // Un chantier ANNULÉ ne se facture pas : la facture disparaissait du tableau de bord
    // (qui exclut les annulés) tout en gonflant « facturé » sur la fiche.
    if (ref.projet.statut === "annule") {
      return NextResponse.json({ error: "saisie refusée", message: "ce chantier est ANNULÉ : aucune facture ne peut y être rattachée" }, { status: 409 });
    }
    // Facturé = émis, pas prévu : une date future atterrissait dans le « facturé » de
    // l'an prochain. Dépenses et heures la refusent déjà.
    if (String(body.date).slice(0, 10) > aujourdhuiMontreal()) {
      return NextResponse.json({ error: "date dans le futur — on saisit une facture émise, pas prévue" }, { status: 400 });
    }
    // Numéro : généré (F-NNN, MAX+1) s'il est absent ; refusé s'il est déjà pris — deux
    // factures « F-012 » dans deux projets, c'est un recouvrement impossible à suivre.
    const numero = String(body.numero || "").trim();
    if (numero && await numeroFactureExiste(numero)) {
      return NextResponse.json({ error: "numéro déjà pris", message: `Le numéro de facture ${numero} existe déjà. Laisse le champ vide pour un numéro automatique.` }, { status: 409 });
    }
    body.numero = numero || undefined;
    body.montant = montant;
    // Paiement PARTIEL : la colonne `montant_paye` existe mais aucun écran ni aucun total
    // ne la lit (fiche, Finances, tableau de bord ne comptent que `payee = 1`), et
    // « annuler le paiement » la remettait à 0 : un acompte entré par l'API n'existait
    // nulle part, puis disparaissait. Tant que la fonction n'est pas finie, on la refuse
    // franchement plutôt que d'avaler l'argent.
    if (body.montant_paye !== undefined && body.montant_paye !== null && body.montant_paye !== "") {
      const mp = nombreSaisi(body.montant_paye);
      if (!isFinite(mp) || mp < 0) return NextResponse.json({ error: "montant_paye invalide" }, { status: 400 });
      if (!body.payee || Math.abs(mp - montant) > 0.005) {
        return NextResponse.json({ error: "paiement partiel non pris en charge", message: "Crée la facture, puis marque-la payée quand elle est encaissée en entier." }, { status: 400 });
      }
    }
    delete body.montant_paye;
    // Créée « payée » : l'encaissement porte une date, sinon la fiche la compte
    // (`payee = 1`) mais Finances (qui lit `date_paiement`) ne la voit jamais.
    if (body.payee) body.date_paiement = body.date_paiement || aujourdhuiMontreal();
    else delete body.date_paiement;
    const id = await ajouterFactureProjet(body);
    const u = await utilisateurActif(req);
    after(() => journaliser("facture.creee", { req, utilisateur: u || undefined, ref_type: "facture", ref_id: id,
      description: `${body.numero || "sans n°"} · ${montant} $ · projet ${body.projet_id}` }));
    // Deux factures au même numéro, ou même chantier/même montant à quelques jours : on le
    // dit tout de suite, sans refuser l'écriture (un contrat peut avoir deux versements
    // égaux). La facture est déjà créée quand cette vérification tourne.
    const doublons = await doublonsDeLaPieceEnregistree("facture", id);
    return NextResponse.json({ ok: true, id, doublons });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const id = idEntier(body.id);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const invalidePatch = validerEcritureArgent(body, { champsDate: ["date", "date_paiement", "date_echeance"] });
    if (invalidePatch) return NextResponse.json({ error: invalidePatch }, { status: 400 });
    const u = await utilisateurActif(req);
    // Geste d'argent : la trace porte le numéro, le montant et le chantier — « Encaissée
    // le 2026-10-05 » sans montant ne répondait à aucune question six mois plus tard.
    const f = await getFactureProjet(id);
    if (body.action === "marquer_payee") {
      const d = body.date_paiement || aujourdhuiMontreal();
      // Idempotent : une facture déjà encaissée n'est pas remarquée payée (sinon sa date
      // d'encaissement était écrasée par la date du jour). 409 avec le motif.
      const marque = await marquerFacturePayee(id, d);
      if (!marque.ok) return NextResponse.json({ error: "déjà payée", message: marque.raison }, { status: marque.raison?.includes("introuvable") ? 404 : 409 });
      after(() => journaliser("facture.encaissee", { req, utilisateur: u || undefined, ref_type: "facture", ref_id: id,
        description: `${f?.numero || `#${id}`} · ${f?.montant ?? "?"} $ · projet ${f?.projet_id ?? "?"} · encaissée le ${d}`,
        avant: f ? { payee: f.payee, date_paiement: f.date_paiement, montant: f.montant } : undefined, apres: { payee: 1, date_paiement: f?.date_paiement || d, montant: f?.montant } }));
    } else if (body.action === "annuler_paiement") {
      await annulerPaiementFacture(id);
      after(() => journaliser("facture.paiement_annule", { req, utilisateur: u || undefined, ref_type: "facture", ref_id: id,
        description: `${f?.numero || `#${id}`} · ${f?.montant ?? "?"} $ · projet ${f?.projet_id ?? "?"} · encaissement annulé`,
        avant: f ? { payee: f.payee, date_paiement: f.date_paiement, montant: f.montant } : undefined, apres: { payee: 0, date_paiement: null } }));
    } else {
      return NextResponse.json({ error: "action inconnue" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = idEntier(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const u = await utilisateurActif(req);
    const f = await getFactureProjet(id);
    // Une facture ENCAISSÉE ne se supprime plus d'un clic : sans corbeille, c'était de
    // l'argent reçu effacé définitivement, sans confirmation ni possibilité de retour.
    const res = await supprimerFactureProjet(id);
    if (!res.ok) return NextResponse.json({ error: "suppression refusée", message: res.raison }, { status: res.raison?.includes("introuvable") ? 404 : 409 });
    after(() => journaliser("facture.supprimee", { req, utilisateur: u || undefined, ref_type: "facture", ref_id: id,
      description: `Suppression · ${f?.numero || `#${id}`} · ${f?.montant ?? "?"} $ · ${f?.date || ""} · projet ${f?.projet_id ?? "?"}`,
      avant: f || undefined }));
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
