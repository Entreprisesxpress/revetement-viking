import { describe, it, expect } from "vitest";
import { validerDate, validerMontant, validerEcritureArgent, MONTANT_MAX } from "./validation-argent";

describe("validerDate", () => {
  it("accepte une vraie date", () => {
    expect(validerDate("2026-08-09")).toBeNull();
  });
  it("refuse une date libre (elle rendait la ligne invisible dans tous les filtres)", () => {
    expect(validerDate("n-importe-quoi")).toMatch(/AAAA-MM-JJ/);
    expect(validerDate("09/08/2026")).toMatch(/AAAA-MM-JJ/);
  });
  it("refuse le 31 février (JS le décalait au 3 mars en silence)", () => {
    expect(validerDate("2026-02-31")).toMatch(/inexistante/);
  });
  it("refuse une année aberrante", () => {
    expect(validerDate("0202-08-09")).toMatch(/hors plage/);
    expect(validerDate("9999-08-09")).toMatch(/hors plage/);
  });
  it("laisse passer l'absence de date (champ optionnel en modification)", () => {
    expect(validerDate(undefined)).toBeNull();
    expect(validerDate("")).toBeNull();
  });
});

describe("validerMontant", () => {
  it("accepte la saisie québécoise", () => {
    expect(validerMontant("1 234,56")).toBeNull();
    expect(validerMontant("88,50 $")).toBeNull();
  });
  it("refuse 1e21 — mesuré : la marge du projet passait à -8,7e20", () => {
    expect(validerMontant(1e21)).toMatch(/hors plage/);
    expect(validerMontant(-1e21)).toMatch(/hors plage/);
  });
  it("refuse au-delà du plafond, accepte juste en dessous", () => {
    expect(validerMontant(MONTANT_MAX + 1)).toMatch(/hors plage/);
    expect(validerMontant(MONTANT_MAX)).toBeNull();
  });
  it("refuse un texte", () => {
    expect(validerMontant("abc")).toMatch(/invalide/);
  });
  it("tolère le négatif par défaut (note de crédit fournisseur)", () => {
    expect(validerMontant(-500)).toBeNull();
  });
  it("refuse le négatif quand on l'exige (extra facturé au client)", () => {
    expect(validerMontant(-500, { refuserNegatif: true })).toMatch(/négatif/);
  });
});

describe("validerEcritureArgent", () => {
  it("valide une dépense correcte", () => {
    expect(validerEcritureArgent({ date: "2026-08-09", montant: "1 250,75" })).toBeNull();
  });
  it("attrape la date ET le montant", () => {
    expect(validerEcritureArgent({ date: "bidon", montant: 100 })).toMatch(/AAAA-MM-JJ/);
    expect(validerEcritureArgent({ date: "2026-08-09", montant: 1e21 })).toMatch(/hors plage/);
  });
  it("couvre plusieurs champs de date (facture : émission, paiement, échéance)", () => {
    const e = validerEcritureArgent({ date: "2026-08-09", date_paiement: "pas-une-date", montant: 100 },
      { champsDate: ["date", "date_paiement"] });
    expect(e).toMatch(/date_paiement/);
  });
  it("couvre plusieurs champs de montant (extra : montant + heures)", () => {
    const e = validerEcritureArgent({ montant: 100, heures: -5 },
      { refuserNegatif: true, champsMontant: ["montant", "heures"] });
    expect(e).toMatch(/heures/);
  });
});
