import { NextRequest, NextResponse, after } from "next/server";
import { listerDepensesProjet, ajouterDepenseProjet, supprimerDepenseProjet, modifierDepenseProjet, fournisseursConnus, listerToutesDepenses, categoriesParFournisseur, projetPourSaisie, getDepenseProjet, doublonsDeLaPieceEnregistree, listerCategoriesDepense } from "@/lib/db";
import { idEntier, lireCorps, texte } from "@/lib/requete";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";
import { nombreSaisi } from "@/lib/calculs";
import { validerEcritureArgent } from "@/lib/validation-argent";
import { accepteSaisieTardive, JOURS_GRACE_SAISIE } from "@/lib/statuts-projet";
import { avecIdempotence } from "@/lib/idempotence";
import { aujourdhuiMontreal } from "@/lib/date";

/** La catégorie doit être une catégorie ACTIVE de la liste (table categories_depense, celle
 *  que /api/categories-depense sert à l'écran). Un appel direct ou un écran périmé pouvait
 *  écrire « matériaux » avec une faute, et la dépense sortait de tous les regroupements.
 *  Comparaison sans casse ni espaces de bord ; la graphie de la liste est remise dans le
 *  corps. Renvoie la réponse de refus, sinon null. */
async function refusCategorie(body: any): Promise<NextResponse | null> {
  if (body.categorie === undefined || body.categorie === null || body.categorie === "") return null;
  const voulue = String(body.categorie).trim().toLowerCase();
  const liste = await listerCategoriesDepense(true);
  const trouvee = liste.find((c) => String(c.nom || "").trim().toLowerCase() === voulue);
  if (!trouvee) {
    return NextResponse.json({ error: "catégorie inconnue", message: `« ${String(body.categorie).slice(0, 60)} » n'est pas dans la liste des catégories de dépense (${liste.map((c) => c.nom).join(", ") || "liste vide"}). Ajoute-la dans Dépenses → Catégories, ou choisis-en une de la liste.` }, { status: 400 });
  }
  body.categorie = trouvee.nom;
  return null;
}

/** Une dépense ne se date pas dans le futur (même règle que les heures) : la date du reçu
 *  est passée ou d'aujourd'hui, en jour de Montréal. */
function refusDateFuture(body: any): NextResponse | null {
  if (body.date && String(body.date) > aujourdhuiMontreal()) {
    return NextResponse.json({ error: "date dans le futur — on saisit une dépense faite, pas prévue" }, { status: 400 });
  }
  return null;
}

/** Le chantier visé existe-t-il et accepte-t-il encore une dépense ? Même règle que les
 *  menus (lib/statuts-projet.ts), appliquée côté serveur : un appel direct ou un écran
 *  pas à jour pouvait imputer une dépense à un chantier annulé ou facturé depuis des
 *  mois. `null`/vide = dépense générale, permis. Renvoie la réponse de refus, sinon null. */
async function refusProjet(projet_id: any): Promise<NextResponse | null> {
  if (projet_id !== null && projet_id !== undefined && projet_id !== "" && !idEntier(projet_id)) {
    return NextResponse.json({ error: "projet_id invalide" }, { status: 400 });
  }
  const ref = await projetPourSaisie(projet_id);
  if (ref === null) return null;
  if (!ref.existe) return NextResponse.json({ error: "projet introuvable — laisse le projet vide pour une dépense générale" }, { status: 400 });
  if (accepteSaisieTardive(ref.projet)) return null;
  const message = ref.projet.statut === "annule"
    ? "ce chantier est ANNULÉ : aucune dépense ne peut y être rattachée"
    : `ce chantier est complété depuis plus de ${JOURS_GRACE_SAISIE} jours : la saisie est fermée (le coût de revient d'un dossier déjà facturé ne doit plus bouger)`;
  return NextResponse.json({ error: "saisie refusée", message }, { status: 409 });
}

import { ipClient } from "@/lib/ip";
const ipDe = (req: NextRequest) => ipClient(req);
// Accepte la virgule décimale québécoise (« 88,50 ») en plus du point.
// Implémentation unique dans lib/calculs.ts : « 88,50 », « 1 234,56 $ », etc.
const parseMontant = nombreSaisi;

// Bornes partagées avec /api/factures et /api/extras (lib/validation-argent.ts).
// Le négatif reste toléré ici : note de crédit / remboursement fournisseur.
// Textes bornés au passage (fournisseur 200, description 1000).
function validerDepense(body: any): string | null {
  body.fournisseur = texte(body.fournisseur, 200);
  body.description = texte(body.description, 1000);
  return validerEcritureArgent(body);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("fournisseurs") === "1") return NextResponse.json(await fournisseursConnus());
  if (sp.get("categories_par_fournisseur") === "1") return NextResponse.json(await categoriesParFournisseur());
  // Sans les blobs de reçus PAR DÉFAUT (`?data=1` pour les inclure) : aucun écran ne lit
  // `recu_data` dans une liste — ils regardent `a_recu` et ouvrent /api/depenses/[id]/recu.
  // Avant, la liste d'un projet partait avec tous ses reçus en base64 (plusieurs Mo).
  const sansData = sp.get("data") !== "1";
  const pidBrut = sp.get("projet_id");
  if (pidBrut === null) return NextResponse.json(await listerToutesDepenses({ sansData }));
  // `projet_id=` vide : les dépenses générales (sans projet).
  if (pidBrut === "") return NextResponse.json(await listerDepensesProjet(null, { sansData }));
  const projet_id = idEntier(pidBrut);
  if (!projet_id) return NextResponse.json({ error: "projet_id invalide" }, { status: 400 });
  return NextResponse.json(await listerDepensesProjet(projet_id, { sansData }));
}

export async function POST(req: NextRequest) {
  return avecIdempotence(req, () => creerDepense(req));
}

async function creerDepense(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    // Montant : NOMBRE fini exigé (« abc » passait et corrompait les totaux).
    // Négatif toléré : note de crédit / remboursement fournisseur.
    const montant = parseMontant(body.montant);
    if (!body.montant || !isFinite(montant) || !body.date) {
      return NextResponse.json({ error: "montant (nombre) et date requis" }, { status: 400 });
    }
    const invalide = validerDepense(body);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    const futur = refusDateFuture(body);
    if (futur) return futur;
    const mauvaiseCategorie = await refusCategorie(body);
    if (mauvaiseCategorie) return mauvaiseCategorie;
    // Sans projet_id, c'est une dépense générale : permis. Avec un projet_id qui ne
    // pointe sur RIEN, la dépense n'apparaît sur aucune fiche mais reste comptée dans
    // les totaux — de l'argent hors de vue. Mesuré : elle sortait bien dans la liste
    // globale alors que /api/projets?id=… répondait 404. Et un chantier annulé ou fermé
    // depuis longtemps n'accepte plus de dépense (409).
    const refus = await refusProjet(body.projet_id);
    if (refus) return refus;
    body.montant = montant;
    if (body.projet_id) body.projet_id = idEntier(body.projet_id);
    const user = await utilisateurActif(req);
    const id = await ajouterDepenseProjet({ ...body, ajoute_par: user || undefined });
    // Journalisation APRÈS la réponse (after) : si elle échouait après l'insertion réussie,
    // la route renverrait 500 → le client croirait à un échec → double dépense au 2e essai.
    const ip = ipDe(req);
    after(() => journaliser("depense.ajoutee", {
      ref_type: "depense", ref_id: id, utilisateur: user || undefined,
      description: `${body.fournisseur || "?"} · ${body.montant}$ · ${body.categorie || "?"} · projet ${body.projet_id || "—"}`,
      ip,
    }));
    // Doublon possible : on AVERTIT, on ne refuse pas. Deux voyages de gravier le même
    // jour au même prix, ça existe. L'écriture est déjà faite ; la détection ne peut donc
    // pas faire échouer la saisie (elle avale ses propres erreurs, voir lib/db.ts).
    const doublons = await doublonsDeLaPieceEnregistree("depense", id);
    return NextResponse.json({ ok: true, id, doublons });
  } catch (e: any) {
    console.error("[/api/depenses POST]", e);
    // JSON propre (jamais de page HTML) → le client peut toujours lire le message.
    return NextResponse.json({ error: e?.message || "Erreur serveur lors de l'enregistrement" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await lireCorps(req);
  if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(body.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  // Mêmes bornes qu'à la création : sinon on refuse une dépense aberrante à la saisie
  // et on l'accepte à la modification, ce qui revient à ne rien refuser du tout.
  const invalide = validerDepense(body);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  const futur = refusDateFuture(body);
  if (futur) return futur;
  const mauvaiseCategorie = await refusCategorie(body);
  if (mauvaiseCategorie) return mauvaiseCategorie;
  if (body.montant !== undefined) {
    const montant = parseMontant(body.montant);
    if (!isFinite(montant)) return NextResponse.json({ error: "montant invalide" }, { status: 400 });
    // Un montant à 0 en modification vient presque toujours d'un champ vidé par erreur
    // (`+""` vaut 0). On refuse plutôt que de ramener la dépense à zéro en silence.
    if (montant === 0) return NextResponse.json({ error: "montant à 0 refusé — vide le champ puis ressaisis le vrai montant, ou supprime la dépense" }, { status: 400 });
    body.montant = montant;
  }
  // Le chantier visé — celui qu'on rattache, sinon celui de la dépense — doit encore
  // accepter une saisie (même règle qu'à la création).
  let projetVise: any = body.projet_id;
  if (projetVise === undefined) {
    const actuelle = await getDepenseProjet(id);
    if (!actuelle) return NextResponse.json({ error: "dépense introuvable" }, { status: 404 });
    projetVise = actuelle.projet_id;
  }
  const refus = await refusProjet(projetVise);
  if (refus) return refus;
  if (body.projet_id) body.projet_id = idEntier(body.projet_id);
  const user = await utilisateurActif(req);
  // Verrouillage optimiste (B7) : 409 si la dépense a changé depuis son chargement.
  const res = await modifierDepenseProjet(id, body, body.version);
  if (!res.ok) {
    if (res.conflit) return NextResponse.json({ error: "conflit", message: "Cette dépense a été modifiée par quelqu'un d'autre entre-temps. Recharge la liste avant de sauvegarder.", versionActuelle: res.versionActuelle }, { status: 409 });
    return NextResponse.json({ error: "dépense introuvable" }, { status: 404 });
  }
  const ip = ipDe(req);
  after(() => journaliser("depense.modifiee", {
    ref_type: "depense", ref_id: id, utilisateur: user || undefined,
    description: `${body.fournisseur || "?"} · ${body.montant || "?"}$`,
    ip,
  }));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const user = await utilisateurActif(req);
  // Même règle de chantier fermé que POST et PATCH : effacer une dépense d'un chantier
  // annulé ou complété depuis plus de 14 jours change le coût de revient d'un dossier déjà
  // facturé. Avant, seule l'écriture était gardée, pas l'effacement.
  const actuelle = await getDepenseProjet(id);
  if (!actuelle) return NextResponse.json({ error: "dépense introuvable" }, { status: 404 });
  const refus = await refusProjet(actuelle.projet_id);
  if (refus) return refus;
  if (!(await supprimerDepenseProjet(id))) return NextResponse.json({ error: "dépense introuvable" }, { status: 404 });
  const ip = ipDe(req);
  after(() => journaliser("depense.supprimee", { ref_type: "depense", ref_id: id, utilisateur: user || undefined, description: `Suppression #${id}`, ip }));
  return NextResponse.json({ ok: true });
}
