import { NextRequest, NextResponse, after } from "next/server";
import { listerClients, getClient, ajouterClient, modifierClient, supprimerClient } from "@/lib/db";
import { asanaEstConfigure, creerTacheAsana, modifierTacheAsana, supprimerTacheAsana, clientVersNotesAsana } from "@/lib/asana";
import { journaliser } from "@/lib/audit";
import { STATUTS_CLIENT, CLES_ETAPES_PIPELINE, estStatutClient, estEtapePipeline, courrielValide } from "@/lib/vocabulaire";
import { idEntier, lireCorps, texte } from "@/lib/requete";

import { ipClient } from "@/lib/ip";
const ipDe = (req: NextRequest) => ipClient(req);
// Le détail (`e.message` : chemin SQL, nom de table, contrainte) reste dans le journal
// serveur ; le client reçoit un message générique.
function fail(e: any, status = 500) { console.error("[/api/clients]", e); return NextResponse.json({ error: "Erreur serveur — voir le journal." }, { status }); }

/** Push Asana en arrière-plan (jamais bloquant pour le client).
 *  `after()` et non une promesse flottante : sur la plateforme, la fonction peut être
 *  gelée dès la réponse envoyée. La tâche Asana se créait alors sans que
 *  `modifierClient(asana_gid)` n'ait le temps de tourner — au sync suivant, la tâche
 *  n'avait plus de correspondance et un client EN DOUBLE était créé. Même chose pour la
 *  suppression : la tâche survivait et le client supprimé ressuscitait. */
function asanaSyncFireAndForget(op: "create" | "update" | "delete", payload: any) {
  if (!asanaEstConfigure()) return;
  after(async () => {
    try {
      if (op === "create") {
        const t = await creerTacheAsana({ name: payload.nom, notes: clientVersNotesAsana(payload) });
        await modifierClient(payload._id, { asana_gid: t.gid, asana_modifie_le: t.modified_at });
      } else if (op === "update") {
        const c = await getClient(payload._id);
        if (c?.asana_gid) {
          await modifierTacheAsana(c.asana_gid, { name: c.nom, notes: clientVersNotesAsana(c), completed: c.statut === "perdu" || c.statut === "inactif" });
        }
      } else if (op === "delete") {
        if (payload.asana_gid) await supprimerTacheAsana(payload.asana_gid);
      }
    } catch (e: any) { console.warn(`Asana ${op} failed:`, e.message); }
  });
}

export async function GET(req: NextRequest) {
  try {
    const idBrut = req.nextUrl.searchParams.get("id");
    if (idBrut) {
      const id = idEntier(idBrut);
      if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
      const c = await getClient(id);
      if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(c);
    }
    return NextResponse.json(await listerClients());
  } catch (e) { return fail(e); }
}


/** Vocabulaire fermé : statut client, étape de pipeline, format de courriel.
 *  Mesuré : le serveur acceptait « licorne » comme statut et « etape_inexistante »
 *  comme étape — la fiche disparaissait alors de tous les filtres et de toutes les
 *  colonnes du kanban, sans le moindre message. Un dossier perdu en silence.
 *  Le courriel invalide, lui, faisait partir les relances dans le vide. */
function validerClient(body: any): string | null {
  // Textes bornés (une fiche à 2 Mo de notes ralentissait chaque liste qui la portait).
  body.nom = texte(body.nom, 200);
  body.notes = texte(body.notes, 5000);
  body.adresse = texte(body.adresse, 300);
  if (body.statut !== undefined && body.statut !== null && body.statut !== "" && !estStatutClient(body.statut)) {
    return `statut inconnu « ${body.statut} » (attendu : ${STATUTS_CLIENT.join(", ")})`;
  }
  if (body.pipeline_stage !== undefined && !estEtapePipeline(body.pipeline_stage)) {
    return `étape de pipeline inconnue « ${body.pipeline_stage} » (attendu : ${CLES_ETAPES_PIPELINE.join(", ")})`;
  }
  if (!courrielValide(body.courriel)) return `courriel invalide « ${body.courriel} »`;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const invalide = validerClient(body);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    if (!body.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    const id = await ajouterClient(body);
    const ip = ipDe(req);
    after(() => journaliser("client.cree", { ref_type: "client", ref_id: id, description: body.nom, ip }));
    if (!body.asana_gid && body.source !== "Asana" && body._skip_asana !== true) {
      asanaSyncFireAndForget("create", { ...body, _id: id });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const id = idEntier(body.id);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    // Mêmes règles qu'à la création : c'est le glisser-déposer du kanban qui écrit
    // `pipeline_stage`, donc c'est ici que la valeur douteuse arrive en pratique.
    const invalidePatch = validerClient(body);
    if (invalidePatch) return NextResponse.json({ error: invalidePatch }, { status: 400 });
    // Un nom vide ou null effaçait le nom de la fiche : elle devenait introuvable dans la
    // recherche et le kanban affichait une carte sans titre.
    if (body.nom !== undefined && !body.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    if (!(await modifierClient(id, body))) return NextResponse.json({ error: "client introuvable" }, { status: 404 });
    const ip = ipDe(req);
    after(() => journaliser("client.modifie", { ref_type: "client", ref_id: id, description: body.nom || `id ${id}`, ip }));
    if (body._skip_asana !== true) {
      asanaSyncFireAndForget("update", { _id: id });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = idEntier(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const c = await getClient(id);
    if (!c) return NextResponse.json({ error: "client introuvable" }, { status: 404 });
    const res = await supprimerClient(id);
    // Refus quand des contrats SIGNÉS sont rattachés : on ne détruit pas une pièce
    // juridique en supprimant une fiche client.
    if (!res.ok) return NextResponse.json({ error: res.raison, contrats_signes: res.contrats_signes }, { status: 409 });
    const ip = ipDe(req);
    after(() => journaliser("client.supprime", { ref_type: "client", ref_id: id, description: c.nom || `id ${id}`, ip }));
    if (c.asana_gid) asanaSyncFireAndForget("delete", { asana_gid: c.asana_gid });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
