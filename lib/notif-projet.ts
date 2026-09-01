// Avis internes envoyés à Francis quand un chantier change d'état.
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

export interface ProjetComplete {
  id: number; nom?: string | null; numero?: string | null;
  client_nom?: string | null; client_courriel?: string | null; adresse_chantier?: string | null;
  date_debut?: string | null; date_fin_reelle?: string | null;
  prix_contrat?: number | null; budget_estime?: number | null; extras_factures?: number | null;
  total_heures?: number | null; cout_main_oeuvre?: number | null;
  total_depenses?: number | null; marge?: number | null; marge_pct?: number | null;
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

/** Construit l'avis « chantier complété ». Pur : aucun accès réseau, aucune horloge. */
export function messageProjetComplete(p: ProjetComplete, lienBase?: string): { sujet: string; texte: string } {
  const nom = (p.nom || "").trim() || `Projet #${p.id}`;
  const client = (p.client_nom || "").trim();
  const courriel = (p.client_courriel || "").trim();
  const aFacturer = resteAFacturer(p);
  const aEncaisser = Number(p.total_facture || 0) - Number(p.total_paye || 0);

  // L'action du jour, en tête du message : le courriel sert d'abord à déclencher la
  // facturation. Les chiffres du chantier viennent après.
  const action = aFacturer > 0.005
    ? [
        `👉 À FAIRE : envoyer la facture au client — ${argent(aFacturer)}`,
        `   ${client || "Client non renseigné"}${courriel ? ` · ${courriel}` : " · pas de courriel au dossier"}`,
      ]
    : aEncaisser > 0.005
      ? [`👉 Déjà facturé au complet. Reste à ENCAISSER : ${argent(aEncaisser)}.`]
      : [`✔️ Rien à faire côté facturation : facturé et encaissé au complet.`];

  const lignes = [
    `Le chantier « ${nom} » est terminé.`,
    "",
    ...action,
    "",
    "— Détail du chantier —",
    `Client        : ${client || "—"}`,
    `Adresse       : ${(p.adresse_chantier || "").trim() || "—"}`,
    `Numéro        : ${(p.numero || "").trim() || "—"}`,
    `Début         : ${jourMontreal(p.date_debut) || "—"}`,
    `Fin réelle    : ${jourMontreal(p.date_fin_reelle) || "—"}`,
    "",
    `Contrat       : ${argent(p.prix_contrat || p.budget_estime || 0)}`,
    `Extras facturés : ${argent(p.extras_factures || 0)}`,
    `Déjà facturé  : ${argent(p.total_facture || 0)} · encaissé : ${argent(p.total_paye || 0)}`,
    `Heures        : ${heures(p.total_heures)} (${argent(p.cout_main_oeuvre || 0)})`,
    `Dépenses      : ${argent(p.total_depenses || 0)}`,
    `Marge         : ${argent(p.marge || 0)}${isFinite(Number(p.marge_pct)) ? ` (${Number(p.marge_pct).toFixed(1)} %)` : ""}`,
  ];

  if (lienBase) lignes.push("", `Fiche du chantier : ${lienBase.replace(/\/+$/, "")}/projets/${p.id}`);

  // Le sujet porte l'action : lisible d'un coup d'œil sur le téléphone, sans ouvrir.
  const suffixe = aFacturer > 0.005 ? ` — à facturer ${argent(aFacturer)}` : "";
  return { sujet: `✅ Chantier terminé — ${nom}${client ? ` (${client})` : ""}${suffixe}`, texte: lignes.join("\n") };
}

/** Envoie l'avis. Ne lève JAMAIS : un courriel raté ne doit pas faire échouer la
 *  fermeture du chantier, qui est l'opération que Francis a demandée. Le résultat est
 *  retourné pour être journalisé par l'appelant. */
export async function avertirProjetComplete(p: ProjetComplete, lienBase?: string): Promise<{ ok: boolean; raison?: string }> {
  if (!emailEstConfigure()) return { ok: false, raison: "courriel non configuré (RESEND_API_KEY ou GMAIL_USER absent)" };
  try {
    const { sujet, texte } = messageProjetComplete(p, lienBase);
    const r = await sendEmail({ to: destinataireNotifications(), subject: sujet, text: texte });
    return r.ok ? { ok: true } : { ok: false, raison: r.error || r.raison || "envoi refusé" };
  } catch (e: any) {
    return { ok: false, raison: e?.message || "erreur inattendue" };
  }
}
