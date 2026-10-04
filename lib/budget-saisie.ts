// Budget d'un chantier pendant la SAISIE (heures, dépenses) — logique pure.
//
// Les modales de saisie listent les chantiers avec `/api/projets?lite=1`, qui ne porte
// ni `cout_total`, ni `revenu_avant_taxes`, ni `total_depenses` : lus sur cette liste,
// ces champs valaient `undefined` et l'écran affichait « Reste budget : NaN $ », et
// l'alerte de dépassement ne se déclenchait jamais. Les fonctions ci-dessous ne
// répondent QUE sur une fiche complète (`/api/projets?id=`) : sinon `null`, et
// l'appelant n'affiche pas la ligne — jamais « NaN » à l'écran.

import { revenuAvantTaxes } from "./calculs";

export interface FicheBudget {
  budget_estime?: number | null;
  revenu_avant_taxes?: number | null;
  cout_total?: number | null;
  total_depenses?: number | null;
}

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Budget HORS taxes de la fiche (le budget saisi est taxes incluses), ou null sans budget. */
export function budgetHorsTaxes(f: FicheBudget | null | undefined): number | null {
  if (!f) return null;
  if (fini(f.revenu_avant_taxes) && f.revenu_avant_taxes > 0) return f.revenu_avant_taxes;
  if (fini(f.budget_estime) && f.budget_estime > 0) return revenuAvantTaxes(f.budget_estime);
  return null;
}

/** Reste de budget hors taxes (budget HT − coût engagé HT), ou null si la fiche
 *  ne porte pas les totaux (liste lite) ou n'a pas de budget. */
export function resteBudget(f: FicheBudget | null | undefined): number | null {
  const budget = budgetHorsTaxes(f);
  if (budget === null || !f || !fini(f.cout_total)) return null;
  return budget - f.cout_total;
}

/** Pourcentage du budget consommé une fois `ajout` (coût HT) enregistré, ou null. */
export function pctBudgetApresAjout(f: FicheBudget | null | undefined, ajout: number): number | null {
  const budget = budgetHorsTaxes(f);
  if (budget === null || !f || !fini(f.cout_total) || !fini(ajout)) return null;
  return ((f.cout_total + ajout) / budget) * 100;
}

/** Dépenses déjà saisies sur la fiche, ou null si la fiche ne les porte pas. */
export function depensesFiche(f: FicheBudget | null | undefined): number | null {
  return f && fini(f.total_depenses) ? f.total_depenses : null;
}
