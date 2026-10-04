// Ingestion des formulaires du site web (GoDaddy) → CRM.
// Reçoit soit des champs structurés {nom, courriel, telephone, adresse, message},
// soit le texte brut d'un courriel de formulaire {texte_brut} qu'on parse ici.
// Protégé par LEAD_WEBHOOK_SECRET (fail-closed : 503 si non configuré).
// Anti-doublon : si un client existe déjà (courriel/téléphone/nom), on ajoute une
// interaction au lieu de créer un doublon.
import { NextRequest, NextResponse, after } from "next/server";
import { ajouterInteraction, initDb, rattacherOuCreerClient } from "@/lib/db";
import { envoyerPushUtilisateur } from "@/lib/push";
import { journaliser } from "@/lib/audit";
import { rateLimitDepasse, timingSafeEqual, empreinteDejaVue, memoriserEmpreinte } from "@/lib/rateLimit";
import { parserTexteFormulaire } from "@/lib/lead-web";
import { empreinteRequete } from "@/lib/empreinte-requete";
import { aujourdhuiMontreal } from "@/lib/date";

// Anti-rejeu : un même formulaire renvoyé (relance du scénario, double clic, rejeu d'une
// requête capturée) dans les 24 h ne crée ni interaction ni push — il répond simplement
// `doublon: true`. Le contrat pour l'émetteur ne change pas (même en-tête, même 200).
const FENETRE_REJEU_H = 24;
const PORTEE_EMPREINTE = "lead-web";

export const dynamic = "force-dynamic";

import { ipClient } from "@/lib/ip";
const ipDe = (req: NextRequest) => ipClient(req);

export async function POST(req: NextRequest) {
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "LEAD_WEBHOOK_SECRET non configuré — endpoint désactivé" }, { status: 503 });
  }
  const fourni = req.headers.get("x-lead-secret") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!fourni || !timingSafeEqual(fourni, secret)) {
    await journaliser("auth.login_echec", { description: "Secret lead-web invalide", ip: ipDe(req) });
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  const ip = ipDe(req);
  // Compte les entrées « client.cree » (écrites plus bas à CHAQUE requête acceptée) :
  // compter un type jamais journalisé rendrait la limite inopérante.
  if (await rateLimitDepasse("client.cree", ip, 60, 60)) {
    return NextResponse.json({ error: "trop de requêtes" }, { status: 429 });
  }

  // Un corps absent ou illisible vaut un formulaire vide : la route répond alors 400
  // (« au moins un de nom/courriel/telephone requis ») — contrat inchangé pour l'émetteur.
  const brut = await req.json().catch(() => null);
  const body: any = brut && typeof brut === "object" ? brut : {};
  // Champs structurés d'abord ; le texte brut complète ce qui manque.
  const parse = body.texte_brut ? parserTexteFormulaire(String(body.texte_brut)) : {};
  const nom = String(body.nom || parse.nom || "").trim().slice(0, 120);
  const courriel = String(body.courriel || parse.courriel || "").trim().slice(0, 200) || null;
  const telephone = String(body.telephone || parse.telephone || "").trim().slice(0, 40) || null;
  const adresse = String(body.adresse || parse.adresse || "").trim().slice(0, 300) || null;
  const sujet = String(body.sujet || parse.sujet || "").trim().slice(0, 200) || null;
  const message = String(body.message || parse.message || "").trim().slice(0, 4000) || null;
  const source = String(body.source || "site web").trim().slice(0, 80);

  if (!nom && !courriel && !telephone) {
    return NextResponse.json({ error: "au moins un de nom/courriel/telephone requis" }, { status: 400 });
  }

  await initDb();
  const empreinte = empreinteRequete({ nom, courriel, telephone, adresse, sujet, message, source });
  if (await empreinteDejaVue(PORTEE_EMPREINTE, empreinte, FENETRE_REJEU_H)) {
    return NextResponse.json({ ok: true, doublon: true });
  }

  // Anti-doublon : courriel (insensible à la casse), sinon téléphone (10 derniers
  // chiffres), sinon nom exact — seulement si ni le lead ni la fiche n'ont de coordonnées.
  // La règle vit dans rattacherOuCreerClient (lib/db.ts), partagée avec la création de
  // projet et de soumission ; une fiche retrouvée reçoit les coordonnées qui lui manquent.
  // Sans nom, la fiche prend le courriel ou le téléphone comme nom (jamais vide : la route
  // exige au moins l'un des trois).
  const r = await rattacherOuCreerClient(nom, {
    courriel: courriel || undefined, telephone: telephone || undefined, adresse: adresse || undefined,
    statut: "prospect", source, pipeline_stage: "info_1",
  });
  const client_id = r.id;
  const cree = r.cree;
  const existant = cree ? null : { id: r.id, nom: r.nom };

  // Le contenu du formulaire devient une interaction visible dans la fiche CRM.
  await ajouterInteraction({
    client_id, type: "formulaire_web", date: aujourdhuiMontreal(),
    sujet: sujet || "Formulaire du site web",
    note: [message, adresse && !cree ? `Adresse mentionnée : ${adresse}` : null].filter(Boolean).join("\n") || "(sans message)",
    fait_par: "Site web",
  });

  await journaliser("client.cree", {
    ref_type: "client", ref_id: client_id, ip,
    description: cree ? `Lead site web : ${nom || courriel || telephone}` : `Formulaire web (client existant) : ${existant!.nom}`,
  });
  await memoriserEmpreinte(PORTEE_EMPREINTE, empreinte, ip);

  // Push APRÈS la réponse (after) : une promesse détachée pouvait être tuée avec la
  // fonction serverless dès la réponse rendue — le lead arrivait sans que Francis le sache.
  after(() => envoyerPushUtilisateur("Francis", {
    title: cree ? "🌐 Nouveau lead du site web" : "🌐 Formulaire web — client existant",
    body: `${nom || courriel || telephone}${sujet ? ` · ${sujet}` : ""}${message ? ` — ${message.slice(0, 80)}` : ""}`,
    url: `/clients?id=${client_id}`,
    tag: "lead-web",
  }).catch((e: any) => console.error("[/api/lead-web] push non envoyé :", e?.message || e)));

  return NextResponse.json({ ok: true, client_id, cree });
}
