import { NextRequest, NextResponse, after } from "next/server";
import { sauvegarder, lister, charger, supprimer, changerStatut, enregistrerHeuresReelles, statistiques, trouverOuCreerClient, clientParNom } from "@/lib/db";
import { journaliser } from "@/lib/audit";
import { courrielValide } from "@/lib/vocabulaire";
import { calculerSoumission } from "@/lib/calculateur";
import { nombreSaisi } from "@/lib/calculs";
import { lireCorps } from "@/lib/requete";

import { ipClient } from "@/lib/ip";
const ipDe = (req: NextRequest) => ipClient(req);
// Message GÉNÉRIQUE au client : le détail (SQL, chemin, table) reste dans le journal serveur.
function fail(e: any, status = 500) { console.error("[/api/soumissions]", e); return NextResponse.json({ error: "Erreur serveur" }, { status }); }

/** Le total d'une soumission se RECALCULE ici, depuis ses lignes : le `total` envoyé par
 *  le navigateur est ignoré dès que `data` est calculable. Sinon un client (ou un écran
 *  périmé) pouvait enregistrer un total sans rapport avec les lignes — et c'est ce total
 *  qui alimente les statistiques, le CA prévisionnel et la page publique. */
function totalServeur(body: any): { total: number; recalcule: boolean } {
  const d = body?.data;
  if (d && typeof d === "object" && Array.isArray(d.lignes)) {
    try {
      const c = calculerSoumission({
        lignes: d.lignes,
        fraisActifs: Array.isArray(d.fraisActifs) ? d.fraisActifs : [],
        fraisGestion: Number.isFinite(Number(d.fraisGestion)) ? Number(d.fraisGestion) : 0,
        appliquerTaxes: !!d.appliquerTaxes,
      });
      return { total: c.total, recalcule: true };
    } catch (e) {
      console.warn("[/api/soumissions] total non recalculable, total reçu conservé :", (e as Error)?.message);
    }
  } else {
    console.warn(`[/api/soumissions] soumission ${body?.numero || "(nouvelle)"} sans data.lignes : total reçu conservé (${body?.total})`);
  }
  const t = Number(body?.total);
  return { total: Number.isFinite(t) ? t : 0, recalcule: false };
}

export async function GET(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");
    const stats = req.nextUrl.searchParams.get("stats");
    const statut = req.nextUrl.searchParams.get("statut") as any;
    if (stats === "1") return NextResponse.json(await statistiques());
    if (numero) {
      const s = await charger(numero);
      if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
      // Un payload illisible en base est une erreur EXPLICITE (JSON), jamais une page morte.
      let payload: any;
      try { payload = JSON.parse(s.payload_json || "{}"); } catch (e: any) {
        console.error(`[/api/soumissions] payload_json illisible pour ${numero} :`, e?.message || e);
        return NextResponse.json({ error: "données de la soumission illisibles", message: `Le contenu enregistré de la soumission ${numero} n'est pas un JSON valide.` }, { status: 500 });
      }
      return NextResponse.json({ ...s, payload });
    }
    return NextResponse.json(await lister(statut || undefined));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const nouveau = !body.numero;

    // Fiche client créée au passage, comme à la création d'un projet. Une soumission
    // porte déjà toutes les coordonnées du client (nom, adresse, téléphone, courriel)
    // mais ne créait AUCUNE fiche CRM : le prospect n'existait nulle part, donc ni
    // relance, ni pipeline, ni contrat possible sans le ressaisir à la main.
    // Uniquement à la CRÉATION : modifier une soumission ne doit pas créer de fiche.
    let clientCree = false;
    let clientId: number | null = null;
    const c = body.client || {};
    if (nouveau && c.nom?.trim()) {
      if (!courrielValide(c.courriel)) {
        return NextResponse.json({ error: `courriel du client invalide « ${c.courriel} »` }, { status: 400 });
      }
      const avant = await clientParNom(c.nom);
      clientId = await trouverOuCreerClient(c.nom, {
        telephone: c.telephone || undefined,
        courriel: c.courriel || undefined,
        adresse: c.adresse || undefined,
        // Une soumission, c'est un prospect au tout début du pipeline — pas un client
        // actif. Le statut suit quand le contrat est signé.
        statut: "prospect",
        pipeline_stage: "info_1",
      } as any);
      clientCree = !avant && !!clientId;
    }

    const { total } = totalServeur(body);
    const numero = await sauvegarder({ ...body, total });
    const ip = ipDe(req);
    const user_agent = req.headers.get("user-agent") || undefined;
    after(() => journaliser(nouveau ? "soumission.creee" : "soumission.modifiee", {
      ref_type: "soumission", ref_id: numero,
      description: `${body.client?.nom || "?"} · ${total ? total + " $" : "0 $"}`,
      ip, user_agent,
    }));
    return NextResponse.json({ numero, ok: true, client_id: clientId, client_cree: clientCree });
  } catch (e: any) {
    // Refus métier (soumission signée) ≠ panne. 409 pour que l'écran affiche le motif
    // au lieu de « erreur serveur », et pour ne pas polluer le suivi d'incidents.
    if (e?.code === "SOUMISSION_SIGNEE") {
      return NextResponse.json({ error: "soumission signée", message: e.message }, { status: 409 });
    }
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const numero = String(body.numero || "").trim();
    if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    // `heuresReelles` : nombre fini ≥ 0 (virgule acceptée), ou null pour effacer. « abc »
    // était stocké tel quel et faussait les rendements.
    let heuresReelles: number | null | undefined;
    if (body.heuresReelles !== undefined) {
      if (body.heuresReelles === null || body.heuresReelles === "") heuresReelles = null;
      else {
        const h = nombreSaisi(body.heuresReelles);
        if (!Number.isFinite(h) || h < 0) return NextResponse.json({ error: "heuresReelles invalide (nombre d'heures ≥ 0, ex. : 112,5)" }, { status: 400 });
        heuresReelles = h;
      }
    }
    if (body.statut) {
      if (!(await changerStatut(numero, body.statut))) return NextResponse.json({ error: "soumission introuvable" }, { status: 404 });
      const map: Record<string, any> = {
        envoyee: "soumission.envoyee", acceptee: "soumission.acceptee",
        refusee: "soumission.refusee", facturee: "soumission.facturee",
      };
      const ip = ipDe(req);
      after(() => journaliser(map[body.statut] || "soumission.statut_change", {
        ref_type: "soumission", ref_id: numero,
        description: `Statut → ${body.statut}`,
        apres: { statut: body.statut },
        ip,
      }));
    }
    if (heuresReelles !== undefined) {
      if (!(await enregistrerHeuresReelles(numero, heuresReelles as any))) return NextResponse.json({ error: "soumission introuvable" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // Statut inconnu, ou retour en arrière sur une soumission signée : refus métier,
    // pas panne serveur. 409 pour que l'écran affiche le motif.
    if (e?.code === "STATUT_INVALIDE" || e?.code === "SOUMISSION_SIGNEE") {
      return NextResponse.json({ error: "changement refusé", message: e.message }, { status: 409 });
    }
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");
    if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    // Une soumission signée en ligne ou acceptée/facturée ne se supprime pas : 409.
    const supp = await supprimer(numero);
    if (!supp.ok) return NextResponse.json({ error: "suppression refusée", message: supp.raison }, { status: supp.raison?.includes("introuvable") ? 404 : 409 });
    const ip = ipDe(req);
    after(() => journaliser("soumission.supprimee", {
      ref_type: "soumission", ref_id: numero,
      description: `Suppression définitive`, ip,
    }));
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
