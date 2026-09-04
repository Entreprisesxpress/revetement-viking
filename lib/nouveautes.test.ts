import { describe, it, expect } from "vitest";
import {
  NOUVEAUTES, CONNEXIONS_AFFICHAGE, MAX_BLOCS,
  derniereVersion, nouveautesNonVues, encoreAffichable, dateLisible,
} from "./nouveautes";

const liste = [
  { version: "2026-09-04", titre: "C", points: ["c1"] },
  { version: "2026-08-01", titre: "B", points: ["b1"] },
  { version: "2026-06-03", titre: "A", points: ["a1"] },
  { version: "2026-05-01", titre: "Z", points: ["z1"] },
];

describe("la liste réelle respecte la règle de livraison", () => {
  it("est triée de la plus récente à la plus ancienne, sans doublon de jour", () => {
    const versions = NOUVEAUTES.map((n) => n.version);
    const triees = [...versions].sort().reverse();
    expect(versions).toEqual(triees);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("chaque bloc a une date ISO, un titre et au moins un point", () => {
    for (const n of NOUVEAUTES) {
      expect(n.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(n.titre.trim().length).toBeGreaterThan(0);
      expect(n.points.length).toBeGreaterThan(0);
      for (const p of n.points) expect(p.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("nouveautesNonVues", () => {
  it("jamais rien vu → les plus récentes, plafonnées à MAX_BLOCS", () => {
    const r = nouveautesNonVues(null, liste);
    expect(r.length).toBe(MAX_BLOCS);
    expect(r.map((n) => n.titre)).toEqual(["C", "B", "A"]);
  });

  it("a vu la dernière → rien", () => {
    expect(nouveautesNonVues("2026-09-04", liste)).toEqual([]);
    expect(nouveautesNonVues("2026-12-31", liste)).toEqual([]);
  });

  it("a vu une ancienne → seulement ce qui est venu après", () => {
    expect(nouveautesNonVues("2026-06-03", liste).map((n) => n.titre)).toEqual(["C", "B"]);
    expect(nouveautesNonVues("2026-08-01", liste).map((n) => n.titre)).toEqual(["C"]);
  });

  it("chaîne vide = jamais rien vu", () => {
    expect(nouveautesNonVues("", liste).length).toBe(MAX_BLOCS);
  });
});

describe("derniereVersion / encoreAffichable / dateLisible", () => {
  it("derniereVersion prend la tête de liste", () => {
    expect(derniereVersion(liste)).toBe("2026-09-04");
    expect(derniereVersion([])).toBe("");
  });

  it("affichable de la 1re à la CONNEXIONS_AFFICHAGE-ième connexion, plus après", () => {
    expect(encoreAffichable(0)).toBe(false);
    for (let c = 1; c <= CONNEXIONS_AFFICHAGE; c++) expect(encoreAffichable(c)).toBe(true);
    expect(encoreAffichable(CONNEXIONS_AFFICHAGE + 1)).toBe(false);
  });

  it("dateLisible écrit la date en français", () => {
    expect(dateLisible("2026-09-04")).toBe("4 septembre 2026");
    expect(dateLisible("n'importe quoi")).toBe("n'importe quoi");
  });
});
