// API publique (sans auth) pour la signature de soumission par le client.
// Sécurité : le token HMAC dans l'URL fait foi — sans lui, accès refusé.
import { NextRequest, NextResponse, after } from "next/server";
import { charger, marquerSoumissionVue, signerSoumission, refuserSoumission } from "@/lib/db";
import { verifierTokenSoumission } from "@/lib/lien-public";
import { journaliser } from "@/lib/audit";
import { avertirSoumissionReponse, destinataireNotifications } from "@/lib/notif-projet";
import { envoyerPushUtilisateur } from "@/lib/push";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

import { ipClient } from "@/lib/ip";
const ipDe = (req: NextRequest) => ipClient(req);

/** Ne laisse sortir QUE ce que la page publique affiche : un libellé et un montant.
 *
 *  Le commentaire disait déjà « pas les coûts internes », mais on renvoyait les lignes
 *  du payload telles quelles. Mesuré sur une vraie soumission : le client recevait
 *  `margePct: 30` et `surplus: 10` par matériau — soit la majoration exacte appliquée
 *  par Viking, lisible en deux clics dans le navigateur. La page ne s'en sert même pas.
 *  Liste blanche : tout nouveau champ de chiffrage reste interne par défaut. */
function lignesPourClient(lignes: any): any[] {
  if (!Array.isArray(lignes)) return [];
  return lignes.map((l: any) => {
    const sortie: any = {};
    // Libellé (la page essaie description, puis nom, puis code)
    if (l?.description != null) sortie.description = l.description;
    if (l?.nom != null) sortie.nom = l.nom;
    if (l?.code != null) sortie.code = l.code;
    // Montant affiché
    if (l?.montant != null) sortie.montant = l.montant;
    if (l?.total != null) sortie.total = l.total;
    return sortie;
  });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const numero = sp.get("numero") || "";
    const token = sp.get("token") || "";
    if (!numero || !token || !(await verifierTokenSoumission(numero, token))) {
      return NextResponse.json({ error: "lien invalide" }, { status: 403 });
    }
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    // Marque comme vue (1re fois). ATTENDU (await) et non détaché : sur Vercel, une
    // promesse flottante pouvait être tuée avec la fonction dès la réponse rendue — la
    // preuve de consultation n'était jamais écrite. Un échec ne doit pas empêcher le
    // client de voir sa soumission : il est journalisé.
    if (!s.vue_client_le) {
      const ip = ipDe(req);
      try {
        await marquerSoumissionVue(numero);
      } catch (e: any) {
        console.error(`[/api/soumission-publique] marquage « vue » échoué pour ${numero} :`, e?.message || e);
      }
      after(() => journaliser("soumission.statut_change", { ref_type: "soumission", ref_id: numero, description: "👁 Vue par le client (lien public)", ip }));
    }
    // Retourne UNIQUEMENT les infos nécessaires au client (pas les coûts internes).
    // Un payload illisible en base est une erreur EXPLICITE (JSON + journal), pas une page morte.
    let payload: any;
    try { payload = JSON.parse(s.payload_json || "{}"); } catch (e: any) {
      console.error(`[/api/soumission-publique] payload_json illisible pour ${numero} :`, e?.message || e);
      after(() => journaliser("soumission.statut_change", { ref_type: "soumission", ref_id: numero, description: `Lien public : données de la soumission illisibles (${String(e?.message || e).slice(0, 120)})`, ip: ipDe(req) }));
      return NextResponse.json({ error: "données de la soumission illisibles" }, { status: 500 });
    }
    return NextResponse.json({
      numero: s.numero,
      date_creation: s.date_creation,
      client_nom: s.client_nom,
      client_adresse: s.client_adresse,
      projet: s.projet,
      total: s.total,
      statut: s.statut,
      signature_nom: s.signature_nom,
      signature_date: s.signature_date,
      lignes: lignesPourClient(payload.lignes),
      // `fraisActifs` n'est PAS renvoyé : la page publique ne l'affiche pas, et il
      // contient les heures de main-d'œuvre estimées par poste — une information de
      // chiffrage interne.
      appliquerTaxes: payload.appliquerTaxes,
    });
  } catch (e: any) {
    console.error("[/api/soumission-publique GET]", e);
    return NextResponse.json({ error: "erreur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const { numero, token, action, nom } = body;
    if (!numero || !token || typeof numero !== "string" || typeof token !== "string" || !(await verifierTokenSoumission(numero, token))) {
      return NextResponse.json({ error: "lien invalide" }, { status: 403 });
    }
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    if (s.statut === "acceptee" || s.statut === "facturee") {
      return NextResponse.json({ error: "déjà acceptée", deja: true }, { status: 409 });
    }
    const ip = ipDe(req);
    // Avis INTERNE (push + courriel à la boîte Viking) : avant, un client acceptait ou
    // refusait en ligne et personne n'était averti. Envoyé APRÈS la réponse via `after()` :
    // sur Vercel, une promesse simplement détachée pouvait être tuée avec la fonction dès
    // la réponse rendue. Sans exception : la réponse du client ne doit jamais échouer parce
    // qu'un avis a raté. Issue journalisée, échec écrit au journal serveur.
    const avertir = (act: "accepter" | "refuser", signataire?: string) => {
      const titre = act === "accepter" ? `✅ Soumission ${numero} ACCEPTÉE` : `❌ Soumission ${numero} refusée`;
      const origine = publicOrigin(req);
      after(async () => {
        await envoyerPushUtilisateur("Francis", { title: titre, body: `${s.client_nom || "Client"} · ${Number(s.total || 0).toLocaleString("fr-CA")} $`, url: `/soumissions/nouveau?modifier=${numero}`, tag: `soum-${numero}` })
          .catch((e: any) => console.error("[/api/soumission-publique] push non envoyé :", e?.message || e));
        try {
          const r = await avertirSoumissionReponse(s, act, signataire, origine);
          if (!r.ok) console.error("[/api/soumission-publique] avis courriel NON envoyé :", r.raison);
          await journaliser(r.ok ? "soumission.avis_courriel" : "soumission.avis_courriel_echec", {
            ref_type: "soumission", ref_id: numero,
            description: r.ok ? `Avis envoyé à ${destinataireNotifications()}` : `Avis NON envoyé : ${r.raison}`,
          });
        } catch (e: any) {
          console.error("[/api/soumission-publique] avis courriel : exception", e?.message || e);
        }
      });
    };
    if (action === "accepter") {
      const signataire = String(nom || "").trim().slice(0, 120);
      if (!signataire) return NextResponse.json({ error: "nom requis pour signer" }, { status: 400 });
      await signerSoumission(numero, signataire, ip);
      after(() => journaliser("soumission.acceptee", { ref_type: "soumission", ref_id: numero, description: `✍️ Signée en ligne par ${signataire}`, apres: { signature_nom: signataire }, ip }));
      avertir("accepter", signataire);
      return NextResponse.json({ ok: true, statut: "acceptee" });
    } else if (action === "refuser") {
      await refuserSoumission(numero, ip);
      after(() => journaliser("soumission.refusee", { ref_type: "soumission", ref_id: numero, description: "Refusée en ligne par le client", ip }));
      avertir("refuser");
      return NextResponse.json({ ok: true, statut: "refusee" });
    }
    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  } catch (e: any) {
    console.error("[/api/soumission-publique POST]", e);
    return NextResponse.json({ error: "erreur" }, { status: 500 });
  }
}
