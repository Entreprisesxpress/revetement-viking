import { describe, it, expect } from "vitest";
import { estProjetActif, accepteSaisieTardive, JOURS_GRACE_SAISIE, STATUTS_PROJET } from "./statuts-projet";

describe("estProjetActif", () => {
  it("couvre les DEUX statuts d'activité", () => {
    expect(estProjetActif("actif")).toBe(true);
    expect(estProjetActif("en_cours")).toBe(true);
  });

  it("écarte les autres", () => {
    for (const s of ["a_venir", "en_pause", "complete", "annule", "", null, undefined]) {
      expect(estProjetActif(s as any)).toBe(false);
    }
  });
});

describe("accepteSaisieTardive (dépenses ET heures — même règle)", () => {
  const LE_15_AOUT = new Date("2026-08-15T12:00:00Z").getTime();
  const jours = (n: number) => new Date(LE_15_AOUT - n * 86400000).toISOString().slice(0, 10);

  it("un chantier annulé n'accepte jamais rien", () => {
    expect(accepteSaisieTardive({ statut: "annule" }, LE_15_AOUT)).toBe(false);
    // même tout juste terminé : le refus d'un chantier annulé prime.
    expect(accepteSaisieTardive({ statut: "annule", date_fin_reelle: jours(0) }, LE_15_AOUT)).toBe(false);
  });

  it("tout chantier non complété accepte la saisie", () => {
    for (const s of STATUTS_PROJET.filter((x) => x !== "complete" && x !== "annule")) {
      expect(accepteSaisieTardive({ statut: s }, LE_15_AOUT)).toBe(true);
    }
  });

  it("un chantier complété reste saisissable pendant le délai de grâce", () => {
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: jours(0) }, LE_15_AOUT)).toBe(true);
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: jours(13) }, LE_15_AOUT)).toBe(true);
  });

  it("la borne des 14 jours est inclusive", () => {
    // Horodatage complet : sans ambiguïté sur l'heure.
    const finExacte = new Date(LE_15_AOUT - JOURS_GRACE_SAISIE * 86400000).toISOString();
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: finExacte }, LE_15_AOUT)).toBe(true);
    const uneSeconde = new Date(LE_15_AOUT - JOURS_GRACE_SAISIE * 86400000 - 1000).toISOString();
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: uneSeconde }, LE_15_AOUT)).toBe(false);
  });

  it("une date sans heure est lue à minuit UTC — le 14e jour bascule en soirée", () => {
    // `date_fin_reelle` est une date nue (« 2026-08-01 »), lue comme minuit UTC, soit
    // 20 h la veille à Montréal. Le 14e jour n'est donc couvert que jusqu'en fin de
    // journée. Écart de quelques heures, sans conséquence pratique — mais mesuré ici
    // pour que personne ne s'étonne d'un chantier qui disparaît « un jour trop tôt ».
    const minuitUTC = new Date("2026-08-15T00:00:00Z").getTime();
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: jours(14) }, minuitUTC)).toBe(true);
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: jours(14) }, LE_15_AOUT)).toBe(false);
  });

  it("passé le délai, il sort des menus", () => {
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: jours(15) }, LE_15_AOUT)).toBe(false);
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: jours(90) }, LE_15_AOUT)).toBe(false);
  });

  it("la date RÉELLE prime sur la date prévue", () => {
    // Fin prévue vieille de 3 mois, mais le chantier a réellement fermé hier.
    expect(accepteSaisieTardive(
      { statut: "complete", date_fin_reelle: jours(1), date_fin_prevue: jours(90) },
      LE_15_AOUT,
    )).toBe(true);
  });

  it("retombe sur la date prévue quand la réelle manque", () => {
    expect(accepteSaisieTardive({ statut: "complete", date_fin_prevue: jours(2) }, LE_15_AOUT)).toBe(true);
    expect(accepteSaisieTardive({ statut: "complete", date_fin_prevue: jours(30) }, LE_15_AOUT)).toBe(false);
  });

  it("sans date exploitable, le chantier complété sort des menus", () => {
    expect(accepteSaisieTardive({ statut: "complete" }, LE_15_AOUT)).toBe(false);
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: null }, LE_15_AOUT)).toBe(false);
    expect(accepteSaisieTardive({ statut: "complete", date_fin_reelle: "pas une date" }, LE_15_AOUT)).toBe(false);
  });
});
