// Bornes communes à TOUTE écriture d'argent (dépenses, factures, extras).
//
// Pourquoi une autorité unique : /api/heures était bien gardée (heures négatives, > 24 h,
// taux négatif tous refusés) alors que /api/depenses, /api/factures et /api/extras
// acceptaient n'importe quoi. Mesuré en direct : un seul POST à 1e21 faisait passer la
// marge du projet à -869 754 294 411 828 700 000 $ — sur la fiche, dans la liste et dans
// /finances. Et une date libre (« n-importe-quoi ») rendait la ligne invisible dans tous
// les filtres de période tout en restant comptée dans les totaux.
// Import relatif (et non « @/lib/… ») : le harnais de tests ne résout pas l'alias.
import { nombreSaisi } from "./calculs";

const RX_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Plafond de bon sens. Au-delà c'est une faute de frappe ou une valeur corrompue,
 *  pas un chantier de revêtement. */
export const MONTANT_MAX = 10_000_000;

export interface BornesArgent {
  /** Refuser les valeurs négatives (facture, extra). Les dépenses les tolèrent :
   *  note de crédit / remboursement fournisseur. */
  refuserNegatif?: boolean;
  /** Nom du champ dans le message d'erreur (« montant », « heures »…). */
  champ?: string;
}

/** Valide une date AAAA-MM-JJ réelle. Retourne un message d'erreur, ou null. */
export function validerDate(v: any, champ = "date"): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !RX_DATE.test(v)) return `${champ} doit être au format AAAA-MM-JJ`;
  const [a, m, j] = v.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  // Attrape le 2026-02-31 : JS le décale au 3 mars au lieu de refuser.
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return `${champ} inexistante`;
  if (a < 2000 || a > 2100) return `${champ} hors plage (2000-2100)`;
  return null;
}

/** Valide un montant. Retourne un message d'erreur, ou null. */
export function validerMontant(v: any, opts: BornesArgent = {}): string | null {
  if (v === undefined || v === null || v === "") return null;
  const champ = opts.champ || "montant";
  const n = nombreSaisi(v);
  if (!Number.isFinite(n)) return `${champ} invalide`;
  if (opts.refuserNegatif && n < 0) return `${champ} négatif non permis`;
  if (Math.abs(n) > MONTANT_MAX) return `${champ} hors plage (max ${MONTANT_MAX.toLocaleString("fr-CA")} $)`;
  return null;
}

/** Valide en un appel les champs argent + date d'un corps de requête. */
export function validerEcritureArgent(
  body: any,
  opts: BornesArgent & { champsMontant?: string[]; champsDate?: string[] } = {},
): string | null {
  for (const c of opts.champsDate || ["date"]) {
    const e = validerDate(body?.[c], c);
    if (e) return e;
  }
  for (const c of opts.champsMontant || ["montant"]) {
    const e = validerMontant(body?.[c], { ...opts, champ: c });
    if (e) return e;
  }
  return null;
}
