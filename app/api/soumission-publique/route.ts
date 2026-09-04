// API publique (sans auth) pour la signature de soumission par le client.
// Sécurité : le token HMAC dans l'URL fait foi — sans lui, accès refusé.
import { NextRequest, NextResponse } from "next/server";
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
    // Marque comme vue (1re fois)
    if (!s.vue_client_le) {
      marquerSoumissionVue(numero);
      journaliser("soumission.statut_change", { ref_type: "soumission", ref_id: numero, description: "👁 Vue par le client (lien public)", ip: ipDe(req) });
    }
    // Retourne UNIQUEMENT les infos nécessaires au client (pas les coûts internes)
    const payload = JSON.parse(s.payload_json || "{}");
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
    const body = await req.json();
    const { numero, token, action, nom } = body || {};
    if (!numero || !token || !(await verifierTokenSoumission(numero, token))) {
      return NextResponse.json({ error: "lien invalide" }, { status: 403 });
    }
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    if (s.statut === "acceptee" || s.statut === "facturee") {
      return NextResponse.json({ error: "déjà acceptée", deja: true }, { status: 409 });
    }
    const ip = ipDe(req);
    // Avis INTERNE (push + courriel à la boîte Viking) : avant, un client acceptait ou
    // refusait en ligne et personne n'était averti. Détaché et sans exception : la réponse
    // du client ne doit jamais échouer parce qu'un avis a raté. Issue journalisée.
    const avertir = (act: "accepter" | "refuser", signataire?: string) => {
      const titre = act === "accepter" ? `✅ Soumission ${numero} ACCEPTÉE` : `❌ Soumission ${numero} refusée`;
      envoyerPushUtilisateur("Francis", { title: titre, body: `${s.client_nom || "Client"} · ${Number(s.total || 0).toLocaleString("fr-CA")} $`, url: `/soumissions/nouveau?modifier=${numero}`, tag: `soum-${numero}` }).catch(() => {});
      const origine = publicOrigin(req);
      avertirSoumissionReponse(s, act, signataire, origine)
        .then((r) => journaliser(r.ok ? "soumission.avis_courriel" : "soumission.avis_courriel_echec", {
          ref_type: "soumission", ref_id: numero,
          description: r.ok ? `Avis envoyé à ${destinataireNotifications()}` : `Avis NON envoyé : ${r.raison}`,
        }))
        .catch(() => {});
    };
    if (action === "accepter") {
      if (!nom?.trim()) return NextResponse.json({ error: "nom requis pour signer" }, { status: 400 });
      await signerSoumission(numero, nom.trim(), ip);
      journaliser("soumission.acceptee", { ref_type: "soumission", ref_id: numero, description: `✍️ Signée en ligne par ${nom.trim()}`, apres: { signature_nom: nom.trim() }, ip });
      avertir("accepter", nom.trim());
      return NextResponse.json({ ok: true, statut: "acceptee" });
    } else if (action === "refuser") {
      await refuserSoumission(numero, ip);
      journaliser("soumission.refusee", { ref_type: "soumission", ref_id: numero, description: "Refusée en ligne par le client", ip });
      avertir("refuser");
      return NextResponse.json({ ok: true, statut: "refusee" });
    }
    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  } catch (e: any) {
    console.error("[/api/soumission-publique POST]", e);
    return NextResponse.json({ error: "erreur" }, { status: 500 });
  }
}
