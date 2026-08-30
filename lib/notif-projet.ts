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
  client_nom?: string | null; adresse_chantier?: string | null;
  date_debut?: string | null; date_fin_reelle?: string | null;
  prix_contrat?: number | null; budget_estime?: number | null; extras_factures?: number | null;
  total_heures?: number | null; cout_main_oeuvre?: number | null;
  total_depenses?: number | null; marge?: number | null; marge_pct?: number | null;
  total_facture?: number | null; total_paye?: number | null;
}

/** Construit l'avis « chantier complété ». Pur : aucun accès réseau, aucune horloge. */
export function messageProjetComplete(p: ProjetComplete, lienBase?: string): { sujet: string; texte: string } {
  const nom = (p.nom || "").trim() || `Projet #${p.id}`;
  const client = (p.client_nom || "").trim();
  const reste = Number(p.total_facture || 0) - Number(p.total_paye || 0);

  const lignes = [
    `Le chantier « ${nom} » vient d'être marqué complété.`,
    "",
    `Client        : ${client || "—"}`,
    `Adresse       : ${(p.adresse_chantier || "").trim() || "—"}`,
    `Numéro        : ${(p.numero || "").trim() || "—"}`,
    `Début         : ${jourMontreal(p.date_debut) || "—"}`,
    `Fin réelle    : ${jourMontreal(p.date_fin_reelle) || "—"}`,
    "",
    `Contrat       : ${argent(p.prix_contrat || p.budget_estime || 0)}`,
    `Extras facturés : ${argent(p.extras_factures || 0)}`,
    `Heures        : ${heures(p.total_heures)} (${argent(p.cout_main_oeuvre || 0)})`,
    `Dépenses      : ${argent(p.total_depenses || 0)}`,
    `Marge         : ${argent(p.marge || 0)}${isFinite(Number(p.marge_pct)) ? ` (${Number(p.marge_pct).toFixed(1)} %)` : ""}`,
    "",
    // Ce qui reste à encaisser est la vraie action du jour : « complété » vaut « facturé »
    // dans l'app, mais pas « payé ».
    reste > 0.005
      ? `⚠️ Reste à encaisser : ${argent(reste)} sur ${argent(p.total_facture || 0)} facturés.`
      : `Facturé : ${argent(p.total_facture || 0)} · Encaissé : ${argent(p.total_paye || 0)}`,
  ];

  if (lienBase) lignes.push("", `Fiche du chantier : ${lienBase.replace(/\/+$/, "")}/projets/${p.id}`);

  return { sujet: `✅ Chantier complété — ${nom}${client ? ` (${client})` : ""}`, texte: lignes.join("\n") };
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
