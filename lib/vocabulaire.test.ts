import { describe, it, expect } from "vitest";
import {
  STATUTS_SOUMISSION, STATUTS_CLIENT, CLES_ETAPES_PIPELINE,
  estStatutSoumission, estStatutClient, estEtapePipeline, courrielValide,
} from "./vocabulaire";

describe("statuts de soumission", () => {
  it("accepte les cinq statuts réels", () => {
    for (const s of STATUTS_SOUMISSION) expect(estStatutSoumission(s)).toBe(true);
  });
  it("refuse une valeur inventée (elle faisait disparaître la soumission de tous les onglets)", () => {
    expect(estStatutSoumission("statut_bidon")).toBe(false);
    expect(estStatutSoumission("")).toBe(false);
    expect(estStatutSoumission(null)).toBe(false);
    expect(estStatutSoumission("ACCEPTEE")).toBe(false); // la casse compte : les filtres SQL sont exacts
  });
});

describe("statuts de client", () => {
  it("accepte les quatre statuts du CRM", () => {
    for (const s of STATUTS_CLIENT) expect(estStatutClient(s)).toBe(true);
  });
  it("refuse une valeur inventée", () => {
    expect(estStatutClient("licorne")).toBe(false);
    expect(estStatutClient("client")).toBe(false);
  });
});

describe("étapes du pipeline", () => {
  it("accepte les six colonnes du kanban", () => {
    for (const k of CLES_ETAPES_PIPELINE) expect(estEtapePipeline(k)).toBe(true);
  });
  it("accepte l'absence d'étape (le kanban a une colonne « aucune »)", () => {
    expect(estEtapePipeline("")).toBe(true);
    expect(estEtapePipeline(null)).toBe(true);
    expect(estEtapePipeline(undefined)).toBe(true);
  });
  it("refuse une colonne fantôme (la fiche n'apparaissait dans aucune colonne)", () => {
    expect(estEtapePipeline("etape_inexistante")).toBe(false);
    expect(estEtapePipeline("Accepte")).toBe(false);
  });
});

describe("courriel", () => {
  it("accepte les adresses normales", () => {
    expect(courrielValide("marie.lavoie@example.com")).toBe(true);
    expect(courrielValide("info@entreprisesxpress.ca")).toBe(true);
    expect(courrielValide("jf+devis@sous-domaine.example.co.uk")).toBe(true);
  });
  it("accepte l'absence (champ optionnel)", () => {
    expect(courrielValide("")).toBe(true);
    expect(courrielValide(null)).toBe(true);
    expect(courrielValide(undefined)).toBe(true);
  });
  it("refuse ce vers quoi les relances partaient dans le vide", () => {
    expect(courrielValide("pas-un-courriel")).toBe(false);
    expect(courrielValide("marie@")).toBe(false);
    expect(courrielValide("@example.com")).toBe(false);
    expect(courrielValide("marie@example")).toBe(false);   // pas de TLD
    expect(courrielValide("marie @example.com")).toBe(false);
  });
  it("refuse une adresse absurdement longue", () => {
    expect(courrielValide("a".repeat(250) + "@example.com")).toBe(false);
  });
});
