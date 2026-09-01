// Avis INTERNES — Revêtement Viking à Revêtement Viking. Jamais au client.
//
// Sur le chantier, c'est Gabriel qui marque un projet terminé ; au bureau, c'est Francis
// qui facture. Ce courriel est le pont entre les deux : un rappel à soi-même, envoyé à la
// boîte de l'entreprise, pour que la facturation ne traîne pas.
//
// RÈGLE : le destinataire est TOUJOURS la boîte interne. Aucune adresse de client
// n'entre ici — ni en destinataire, ni en copie, ni dans le texte du message. Un client
// qui reçoit par erreur un état de marge, c'est un incident, pas un bogue d'affichage.
//
// Ce fichier ne contient QUE la construction du message, plus un envoi qui ne lève
// jamais. Le rendu est séparé de l'envoi pour être éprouvé par des tests, sans réseau.

import { sendEmail, emailEstConfigure } from "./email";
import { jourMontreal } from "./date";

/** Boîte interne de Revêtement Viking. Déjà l'adresse de référence ailleurs dans le
 *  code (réponse des courriels client, compte Drive, contact des PDF). Surchargeable
 *  par `EMAIL_NOTIFICATIONS` pour rediriger les avis sans toucher au code. */
export const COURRIEL_NOTIFICATIONS_DEFAUT = "revetementviking@gmail.com";

export function destinataireNotifications(): string {
  return (process.env.EMAIL_NOTIFICATIONS || "").trim() || COURRIEL_NOTIFICATIONS_DEFAUT;
}

function argent(v: any): string {
  const n = Number(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
}

function heures(v: any): string {
  const n = Number(v);
  return isFinite(n) && n > 0 ? `${n.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} h` : "—";
}

/** Volontairement SANS `client_courriel` : l'adresse du client n'a rien à faire dans un
 *  avis interne, et l'omettre du type empêche qu'elle y revienne par distraction. */
export interface ProjetComplete {
  id: number; nom?: string | null; numero?: string | null;
  client_nom?: string | null; adresse_chantier?: string | null;
  date_fin_reelle?: string | null;
  prix_contrat?: number | null; budget_estime?: number | null; extras_factures?: number | null;
  total_facture?: number | null; total_paye?: number | null;
}

/** Ce qu'il reste à facturer au client, taxes incluses.
 *
 *  Attention au faux ami : fermer un chantier met `facturee = 1` en base, mais ça veut
 *  dire « revenu reconnu », PAS « facture envoyée ». Le vrai compte des factures émises,
 *  c'est `total_facture`. L'avis doit donc réclamer la facture même sur un chantier
 *  marqué « facturé ». */
export function resteAFacturer(p: ProjetComplete): number {
  const dus = Number(p.prix_contrat || p.budget_estime || 0) + Number(p.extras_factures || 0);
  return dus - Number(p.total_facture || 0);
}

/** Construit le rappel interne « chantier terminé ».
 *  Pur : aucun accès réseau, aucune horloge.
 *  `fermePar` = qui a marqué le chantier terminé (souvent Gabriel, depuis le chantier). */
export function messageProjetComplete(p: ProjetComplete, lienBase?: string, fermePar?: string | null): { sujet: string; texte: string } {
  const nom = (p.nom || "").trim() || `Projet #${p.id}`;
  const client = (p.client_nom || "").trim();
  const par = (fermePar || "").trim();
  const aFacturer = resteAFacturer(p);
  const aEncaisser = Number(p.total_facture || 0) - Number(p.total_paye || 0);

  const action = aFacturer > 0.005
    ? `👉 À FACTURER : ${argent(aFacturer)}`
    : aEncaisser > 0.005
      ? `👉 Déjà facturé. Reste à ENCAISSER : ${argent(aEncaisser)}.`
      : `✔️ Rien à faire : facturé et encaissé au complet.`;

  const lignes = [
    "Rappel interne — Revêtement Viking. Le client n'a rien reçu.",
    "",
    `Le chantier « ${nom} » vient d'être marqué terminé${par ? ` par ${par}` : ""}.`,
    "",
    action,
    "",
    `Client   : ${client || "—"}`,
    `Adresse  : ${(p.adresse_chantier || "").trim() || "—"}`,
    `Numéro   : ${(p.numero || "").trim() || "—"}`,
    `Terminé  : ${jourMontreal(p.date_fin_reelle) || "—"}`,
    `Contrat  : ${argent(p.prix_contrat || p.budget_estime || 0)}${Number(p.extras_factures || 0) ? ` + extras ${argent(p.extras_factures)}` : ""}`,
  ];

  if (lienBase) lignes.push("", `Fiche du chantier : ${lienBase.replace(/\/+$/, "")}/projets/${p.id}`);

  // Le sujet porte l'action : lisible d'un coup d'œil sur le téléphone, sans ouvrir.
  const suffixe = aFacturer > 0.005 ? ` — à facturer ${argent(aFacturer)}` : "";
  return { sujet: `🧾 Chantier terminé — ${nom}${client ? ` (${client})` : ""}${suffixe}`, texte: lignes.join("\n") };
}

/** Envoie l'avis. Ne lève JAMAIS : un courriel raté ne doit pas faire échouer la
 *  fermeture du chantier, qui est l'opération que Francis a demandée. Le résultat est
 *  retourné pour être journalisé par l'appelant. */
export async function avertirProjetComplete(p: ProjetComplete, lienBase?: string, fermePar?: string | null): Promise<{ ok: boolean; raison?: string }> {
  if (!emailEstConfigure()) return { ok: false, raison: "courriel non configuré (RESEND_API_KEY ou GMAIL_USER absent)" };
  try {
    const { sujet, texte } = messageProjetComplete(p, lienBase, fermePar);
    // `to` est la boîte interne, point. Pas de replyTo vers le client : une réponse à cet
    // avis doit rester à l'interne.
    const r = await sendEmail({ to: destinataireNotifications(), subject: sujet, text: texte });
    return r.ok ? { ok: true } : { ok: false, raison: r.error || r.raison || "envoi refusé" };
  } catch (e: any) {
    return { ok: false, raison: e?.message || "erreur inattendue" };
  }
}
