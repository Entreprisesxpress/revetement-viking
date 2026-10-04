import { NextRequest, NextResponse, after } from "next/server";
import { listerProjets, listerProjetsLite, listerProjetsAFacturer, getProjet, ajouterProjet, modifierProjet, supprimerProjet, trouverOuCreerClient, clientParNom, charger, confirmerFacturationProjet } from "@/lib/db";
import { envoyerPushUtilisateur } from "@/lib/push";
import { STATUTS_PROJET, transitionPermise, estReouverture } from "@/lib/statuts-projet";
import { aujourdhuiMontreal } from "@/lib/date";
import { utilisateurActif } from "@/lib/authUser";
import { journaliser } from "@/lib/audit";
import { courrielValide } from "@/lib/vocabulaire";
import { avertirProjetComplete, destinataireNotifications } from "@/lib/notif-projet";
import { publicOrigin } from "@/lib/origin";
import { validerEtNormaliserProjet } from "@/lib/validation-projet";
import { idEntier, lireCorps, texte } from "@/lib/requete";

// Statuts reconnus par l'app (filtres, CA, dashboard). Un statut hors liste rendait
// le projet invisible des filtres ET du CA — silencieusement.
const STATUTS_VALIDES = new Set<string>(STATUTS_PROJET);
function statutInvalide(statut: any): boolean {
  return statut !== undefined && statut !== null && !STATUTS_VALIDES.has(String(statut));
}

/** Effets d'une COMPLÉTION, les mêmes que le projet soit créé « complété » (POST) ou qu'il
 *  y passe (PATCH) : date de fin réelle posée (reconnaissance du CA) et règle
 *  « complété = facturé ». Avant, seul le PATCH les appliquait : un projet créé directement
 *  complété restait sans date de fin, donc hors du CA reconnu, et non facturé. */
function effetsCompletion(body: any): void {
  if (body.date_fin_reelle === undefined || body.date_fin_reelle === null || body.date_fin_reelle === "") body.date_fin_reelle = aujourdhuiMontreal();
  body.facturee = 1;
}

/** La confirmation de facturation est un geste à part (signé par la session) : ces deux
 *  colonnes ne s'écrivent jamais depuis le corps d'une requête. */
function retirerChampsConfirmation(body: any): void {
  delete body.facturation_confirmee_le;
  delete body.facturation_confirmee_par;
  // La règle « complété = facturé » vit ICI (effetsCompletion / réouverture) : `facturee`
  // n'est jamais pris tel quel du corps — sinon un PATCH {facturee:0} sortait un chantier
  // complété du CA facturé sans passer par la réouverture.
  delete body.facturee;
}

/** Textes bornés (nom 200, description 5000, adresse 300). */
function bornerTextes(body: any): void {
  body.nom = texte(body.nom, 200);
  body.description = texte(body.description, 5000);
  body.adresse_chantier = texte(body.adresse_chantier, 300);
}

function ok(data: any, init?: ResponseInit) {
  // no-store : les chiffres (marge, coûts) doivent toujours être frais après
  // ajout d'heures/dépenses. Pas de cache navigateur ni CDN.
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store, max-age=0", ...(init?.headers || {}) } });
}
// Message GÉNÉRIQUE au client : le détail (SQL, chemin, table) reste dans le journal serveur.
// Exception : un numéro de projet déjà pris (index UNIQUE) est un refus délibéré → 409 lisible.
function fail(e: any, status = 500) {
  if (e?.code === "NUMERO_PROJET_PRIS") return NextResponse.json({ error: "numéro déjà pris", message: e.message }, { status: 409 });
  console.error("[/api/projets]", e);
  return NextResponse.json({ error: "Erreur serveur" }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const idBrut = req.nextUrl.searchParams.get("id");
    const statut = req.nextUrl.searchParams.get("statut") || undefined;
    if (idBrut) {
      const id = idEntier(idBrut);
      if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
      const p = await getProjet(id);
      if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
      return ok(p);
    }
    // a_facturer=1 : projets complétés pas encore facturés (rappel dashboard)
    if (req.nextUrl.searchParams.get("a_facturer") === "1") return ok(await listerProjetsAFacturer());
    // lite=1 : liste légère (id/nom/statut) pour les menus déroulants — bien plus rapide
    // que la liste complète avec coûts/marges (PROJ_SQL = 5 sous-requêtes par projet).
    if (req.nextUrl.searchParams.get("lite") === "1") return ok(await listerProjetsLite(statut));
    return ok(await listerProjets(statut));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    if (body.fromSoumission) {
      const s = await charger(String(body.fromSoumission));
      if (!s) return NextResponse.json({ error: "soumission introuvable" }, { status: 404 });
      const client_id = await trouverOuCreerClient(s.client_nom, {
        courriel: s.client_courriel,
        telephone: s.client_telephone,
        adresse: s.client_adresse,
      });
      const id = await ajouterProjet({
        client_id,
        nom: s.projet || `Projet ${s.client_nom}`,
        adresse_chantier: s.client_adresse,
        description: `Soumission ${s.numero} - ${formatCAD(s.total)}`,
        soumission_numero: s.numero,
        budget_estime: s.total,
        heures_estimees: s.heures_estimees,
        date_debut: aujourdhuiMontreal(),
        statut: 'actif',
      });
      return ok({ ok: true, id });
    }
    if (statutInvalide(body.statut)) return NextResponse.json({ error: `statut invalide : ${body.statut}` }, { status: 400 });
    bornerTextes(body);
    if (!body.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    retirerChampsConfirmation(body);
    if (body.client_id !== undefined && body.client_id !== null && body.client_id !== "" && !idEntier(body.client_id)) {
      return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
    }
    // Bornes + conversion des montants et dates AVANT l'écriture (lib/validation-projet.ts) :
    // le corps brut passait tel quel, « 12 500,00 $ » finissait en TEXTE dans prix_contrat.
    const invalide = validerEtNormaliserProjet(body);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    // Créé directement « complété » : mêmes effets qu'une complétion par PATCH.
    if (body.statut === "complete") effetsCompletion(body);
    // Client créé au passage, AVEC ses coordonnées si elles sont fournies. Avant, seul le
    // nom était transmis : la fiche naissait vide, sans téléphone ni courriel, et il
    // fallait retourner dans le CRM la compléter — donc la relance et l'envoi de contrat
    // ne pouvaient pas partir depuis le projet.
    let clientCree = false;
    if (!body.client_id && body.client_nom) {
      if (!courrielValide(body.client_courriel)) {
        return NextResponse.json({ error: `courriel du client invalide « ${body.client_courriel} »` }, { status: 400 });
      }
      const avant = await clientParNom(body.client_nom);
      body.client_id = await trouverOuCreerClient(body.client_nom, {
        telephone: body.client_telephone || undefined,
        courriel: body.client_courriel || undefined,
        // À défaut d'adresse de client, celle du chantier : c'est la même dans
        // l'écrasante majorité des dossiers, et une fiche sans adresse ne sert à rien.
        adresse: body.client_adresse || body.adresse_chantier || undefined,
        statut: "actif",
        source: body.client_source || undefined,
      } as any);
      clientCree = !avant && !!body.client_id;
    }
    const user = await utilisateurActif(req);
    const id = await ajouterProjet({ ...body, cree_par: user || undefined });
    after(() => journaliser("projet.cree", { ref_type: "projet", ref_id: id, utilisateur: user || undefined, description: body.nom || `Projet #${id}` }));
    // `client_cree` remonte à l'écran pour qu'il puisse le dire : créer une fiche client
    // au passage est un effet de bord, il ne doit pas être invisible.
    return ok({ ok: true, id, client_id: body.client_id || null, client_cree: clientCree });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const id = idEntier(body.id);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    body.id = id;
    if (statutInvalide(body.statut)) return NextResponse.json({ error: `statut invalide : ${body.statut}` }, { status: 400 });
    // `statut: null` (ou vide) passait la table des transitions sans la consulter, puis
    // écrivait NULL en base : le projet sortait de tous les filtres et du CA. Refusé.
    if (body.statut === null || body.statut === "") return NextResponse.json({ error: "statut vide refusé — envoie un statut de la liste, ou n'envoie pas le champ" }, { status: 400 });
    bornerTextes(body);
    if (body.nom !== undefined && !body.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    retirerChampsConfirmation(body);
    if (body.client_id !== undefined && body.client_id !== null && body.client_id !== "" && !idEntier(body.client_id)) {
      return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
    }
    const invalide = validerEtNormaliserProjet(body);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    const user = await utilisateurActif(req);

    // Confirmation de facturation — geste À PART, jamais un champ modifiable comme un autre.
    // Le nom vient de la session (`user`), pas du corps : c'est une signature. Le client ne
    // peut donc pas écrire « Facturé par Francis » sans être Francis.
    // 404 si le projet n'existe pas, 409 s'il n'est pas complété (on ne confirme la
    // facturation que d'un chantier fini).
    if (body.facturation_confirmee !== undefined) {
      const confirme = !!body.facturation_confirmee;
      const etat = await confirmerFacturationProjet(id, user, confirme);
      if (!etat.ok) {
        return NextResponse.json({ error: etat.code === "introuvable" ? "projet introuvable" : "confirmation refusée", message: etat.raison }, { status: etat.code === "introuvable" ? 404 : 409 });
      }
      after(() => journaliser(confirme ? "projet.facturation_confirmee" : "projet.facturation_annulee", {
        ref_type: "projet", ref_id: id, utilisateur: user || undefined,
        description: confirme ? `Facturé — confirmé par ${user || "inconnu"}` : "Confirmation de facturation retirée",
      }));
      return ok({ ok: true, facturation_confirmee_le: etat.le, facturation_confirmee_par: etat.par });
    }

    const avant = await getProjet(id);
    if (!avant) return NextResponse.json({ error: "projet introuvable" }, { status: 404 });
    // Table des transitions (lib/statuts-projet.ts) : un annulé ne redevient pas complété
    // d'un clic, un complété ne s'annule pas, un « à venir » ne se complète pas d'un coup.
    if (body.statut !== undefined && body.statut !== null && !transitionPermise(avant.statut, String(body.statut))) {
      return NextResponse.json({ error: "transition refusée", message: `Un projet « ${avant.statut || "?"} » ne peut pas passer à « ${body.statut} ».` }, { status: 409 });
    }
    const nouvelleCompletion = body.statut === "complete" && avant.statut !== "complete";
    // Pose la date de fin réelle (reconnaissance du CA). Règle : complété = facturé.
    if (nouvelleCompletion) effetsCompletion(body);
    // Réouverture d'un chantier complété : il redevient un chantier à facturer, sans
    // date de fin — sinon il resterait compté dans le CA reconnu avec une fin fictive.
    // La confirmation « Facturé par … » tombe aussi : sinon le chantier rouvert, puis
    // complété de nouveau, ne revenait jamais dans le rappel « à facturer ».
    if (body.statut !== undefined && estReouverture(avant.statut, String(body.statut))) {
      body.facturee = 0;
      body.date_fin_reelle = null;
      body.facturation_confirmee_le = null;
      body.facturation_confirmee_par = null;
    }
    await modifierProjet(id, { ...body, modifie_par: user });
    after(() => journaliser("projet.statut_change", { ref_type: "projet", ref_id: id, utilisateur: user || undefined, description: `Modif ${Object.keys(body).filter(k => k !== "id").join(", ")}` }));
    // Avis à Francis : projet complété et marqué facturé.
    if (nouvelleCompletion) {
      const valeur = (avant as any)?.prix_contrat || (avant as any)?.budget_estime || 0;
      after(() => envoyerPushUtilisateur("Francis", {
        title: "✅ Projet complété",
        body: `« ${avant.nom || "Projet"} » est complété et marqué facturé${valeur ? ` (${(+valeur).toLocaleString("fr-CA")} $)` : ""}.`,
        url: `/projets/${id}`,
        tag: "complete-" + id,
      }).catch((e: any) => console.error("[/api/projets] push de complétion non envoyé :", e?.message || e)));

      // Courriel d'avis à la boîte interne. Relu APRÈS l'écriture : `avant` n'a ni la
      // date de fin qu'on vient de poser, ni les derniers totaux. L'envoi se fait APRÈS la
      // réponse, via `after()` : sur Vercel, une promesse simplement détachée pouvait être
      // tuée avec la fonction dès la réponse rendue — l'avis ne partait pas et rien ne le
      // disait. Il ne lève jamais : un courriel raté ne doit pas faire échouer la fermeture
      // du chantier. L'issue est journalisée (et l'échec écrit au journal serveur).
      const origine = publicOrigin(req);
      after(async () => {
        try {
          const apres = await getProjet(id);
          const r = await avertirProjetComplete((apres || avant) as any, origine, user);
          if (!r.ok) console.error("[/api/projets] avis de complétion NON envoyé :", r.raison);
          await journaliser(r.ok ? "projet.avis_courriel" : "projet.avis_courriel_echec", {
            ref_type: "projet", ref_id: id, utilisateur: user || undefined,
            description: r.ok ? `Avis envoyé à ${destinataireNotifications()}` : `Avis NON envoyé : ${r.raison}`,
          });
        } catch (e: any) {
          console.error("[/api/projets] avis de complétion : exception", e?.message || e);
        }
      });
    }
    return ok({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = idEntier(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const user = await utilisateurActif(req);
    const supp = await supprimerProjet(id);
    if (!supp.ok) return NextResponse.json({ error: supp.raison }, { status: 409 });
    after(() => journaliser("projet.supprime", { ref_type: "projet", ref_id: id, utilisateur: user || undefined, description: `Suppression projet #${id}` }));
    return ok({ ok: true });
  } catch (e) { return fail(e); }
}

function formatCAD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);
}
