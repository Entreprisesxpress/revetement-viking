import { describe, it, expect } from "vitest";
import { budgetHorsTaxes, resteBudget, pctBudgetApresAjout, depensesFiche } from "./budget-saisie";

// Ce que renvoie /api/projets?lite=1 : id, nom, statut, budget_estime… mais AUCUN total.
const LITE = { id: 3, nom: "Toit Tremblay", statut: "en_cours", budget_estime: 11497.5 };
// Ce que renvoie /api/projets?id=3 : la fiche complète, avec les totaux calculés.
const FICHE = { ...LITE, revenu_avant_taxes: 10000, cout_total: 9500, total_depenses: 4200 };

describe("budget pendant la saisie — jamais de NaN sur une liste lite", () => {
  it("une fiche lite (sans totaux) ne donne ni reste, ni pourcentage, ni dépenses", () => {
    expect(resteBudget(LITE)).toBeNull();
    expect(pctBudgetApresAjout(LITE, 300)).toBeNull();
    expect(depensesFiche(LITE)).toBeNull();
    expect(resteBudget(null)).toBeNull();
    expect(resteBudget(undefined)).toBeNull();
  });

  it("une fiche complète donne le reste HORS taxes (budget HT − coût HT)", () => {
    expect(resteBudget(FICHE)).toBe(500);
    expect(depensesFiche(FICHE)).toBe(4200);
  });

  it("le pourcentage après ajout compare le coût HT au budget HT (seuils 90 % / 100 %)", () => {
    expect(pctBudgetApresAjout(FICHE, 300)).toBeCloseTo(98, 5);
    expect(pctBudgetApresAjout(FICHE, 600)).toBeCloseTo(101, 5);
  });

  it("sans revenu_avant_taxes, le budget taxes incluses est converti en HT", () => {
    const f = { budget_estime: 11497.5, cout_total: 1000 };
    expect(budgetHorsTaxes(f)).toBeCloseTo(10000, 6);
    expect(resteBudget(f)).toBeCloseTo(9000, 6);
  });

  it("sans budget du tout, rien à afficher", () => {
    expect(resteBudget({ budget_estime: 0, cout_total: 100 })).toBeNull();
    expect(pctBudgetApresAjout({ budget_estime: null, cout_total: 100 }, 10)).toBeNull();
  });

  it("un coût illisible (NaN) ne passe jamais à l'écran", () => {
    expect(resteBudget({ budget_estime: 1000, cout_total: NaN })).toBeNull();
    expect(pctBudgetApresAjout(FICHE, NaN)).toBeNull();
  });
});
