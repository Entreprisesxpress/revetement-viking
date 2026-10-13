import { describe, it, expect } from "vitest";

// 50 × 1,1 = 55,000000000000001 en flottant : `ceil` commandait 56 pièces au lieu de 55
// (45 matériaux du catalogue touchés — une boîte de soffite en trop, +395 $ coûtant).
describe("calculerSoumission — arrondi flottant avant le plafond", () => {
  it("50 pièces + 10 % de surplus = 55 à commander, pas 56", async () => {
    const { calculerSoumission } = await import("./calculateur");
    const { MATERIAUX } = await import("../data/materiaux");
    const piece = MATERIAUX.find((m) => m.qtyParFormat === 1) || MATERIAUX[0];
    const r = calculerSoumission({ lignes: [{ materiauCode: piece.code, quantite: 50, surplus: 0.1, margePct: 0.3 }], fraisActifs: [], fraisGestion: 0.15, appliquerTaxes: true });
    expect(r.lignes[0].quantiteAvecSurplus).toBe(55);
    expect(r.lignes[0].formatACommander).toBe(Math.ceil(55 / piece.qtyParFormat));
  });
  it("2 930 pi² de soffite (boîtes de 293) + 10 % = 11 boîtes, pas 12", async () => {
    const { calculerSoumission } = await import("./calculateur");
    const { MATERIAUX } = await import("../data/materiaux");
    const m = MATERIAUX.find((x) => x.qtyParFormat === 293);
    if (!m) return; // catalogue sans ce format : rien à vérifier ici
    const r = calculerSoumission({ lignes: [{ materiauCode: m.code, quantite: 2930, surplus: 0.1, margePct: 0.3 }], fraisActifs: [], fraisGestion: 0.15, appliquerTaxes: true });
    expect(r.lignes[0].formatACommander).toBe(11);
  });
  it("parIndex garde une entrée (nulle) par ligne saisie, même pour un code inconnu", async () => {
    const { calculerSoumission } = await import("./calculateur");
    const { MATERIAUX } = await import("../data/materiaux");
    const r = calculerSoumission({ lignes: [{ materiauCode: "INCONNU-XYZ", quantite: 10, surplus: 0, margePct: 0.3 }, { materiauCode: MATERIAUX[0].code, quantite: 10, surplus: 0, margePct: 0.3 }], fraisActifs: [], fraisGestion: 0.15, appliquerTaxes: true });
    expect(r.parIndex).toHaveLength(2);
    expect(r.parIndex[0]).toBeNull();
    expect(r.parIndex[1]).toBe(r.lignes[0]);
  });
});
import { calculerSoumission, auCent } from "./calculateur";
import { MATERIAUX } from "../data/materiaux";

describe("auCent", () => {
  it("arrondit au cent, y compris les .xx5 que Math.round(x*100) mange", () => {
    expect(auCent(1.005)).toBe(1.01);
    expect(auCent(2.675)).toBe(2.68);
    expect(auCent(123.456)).toBe(123.46);
    expect(auCent(0)).toBe(0);
  });
});

describe("calculerSoumission — taxes arrondies au cent, total = somme des arrondis", () => {
  it("123,45 $ avant taxes → TPS 6,17 + TVQ 12,31 = 141,93 (cas du constat)", () => {
    // Une seule ligne dont le sous-total vaut exactement 123,45 : on passe par les frais
    // forfaitaires (heures × 90 $) et un frais de gestion à 0 → 1,371666… h × 90 = 123,45.
    const r = calculerSoumission({ lignes: [], fraisActifs: [{ id: "x", heures: 123.45 / 90 }], fraisGestion: 0, appliquerTaxes: true });
    expect(r.sousTotalAvantTaxes).toBe(123.45);
    expect(r.tps).toBe(6.17);   // 6,1725 → 6,17
    expect(r.tvq).toBe(12.31);  // 12,3141… → 12,31
    expect(r.total).toBe(141.93);
    expect(auCent(r.sousTotalAvantTaxes + r.tps + r.tvq)).toBe(r.total);
  });

  it("le total imprimé est TOUJOURS sous-total + TPS + TVQ tels qu'affichés", () => {
    const codes = MATERIAUX.slice(0, 12).map((m) => m.code);
    for (let k = 1; k <= 25; k++) {
      const lignes = codes.map((code, i) => ({ materiauCode: code, quantite: 7 * k + i * 3.3, surplus: 0.1, margePct: 0.4 }));
      const r = calculerSoumission({ lignes, fraisActifs: [{ id: "mob", heures: 4 }], fraisGestion: 0.15, appliquerTaxes: true });
      expect(r.total).toBe(auCent(r.sousTotalAvantTaxes + r.tps + r.tvq));
      expect(r.tps).toBe(auCent(r.tps));
      expect(r.tvq).toBe(auCent(r.tvq));
      expect(r.sousTotalAvantTaxes).toBe(auCent(r.sousTotalAvantTaxes));
    }
  });

  it("sans taxes : TPS et TVQ à 0, total = sous-total", () => {
    const r = calculerSoumission({ lignes: [], fraisActifs: [{ id: "x", heures: 2 }], fraisGestion: 0.15, appliquerTaxes: false });
    expect(r.tps).toBe(0); expect(r.tvq).toBe(0);
    expect(r.total).toBe(r.sousTotalAvantTaxes);
    expect(r.total).toBe(auCent(180 * 1.15));
  });

  it("un code de matériau inconnu est ignoré sans casser le calcul", () => {
    const r = calculerSoumission({ lignes: [{ materiauCode: "N-EXISTE-PAS", quantite: 100, surplus: 0.1, margePct: 0.4 }], fraisActifs: [], fraisGestion: 0.15, appliquerTaxes: true });
    expect(r.lignes).toHaveLength(0);
    expect(r.total).toBe(0);
  });
});
