import { describe, it, expect } from "vitest";
import { semainesDeLaPeriode, totalSemaines, bilanHeures, heuresLisibles } from "./paie-detail";

// Quinzaine réelle (ancrage lundi 18 mai 2026) : 2026-06-01 → 2026-06-14.
const DEBUT = "2026-06-01";
const FIN = "2026-06-14";

describe("semainesDeLaPeriode — calendrier complet d'une quinzaine", () => {
  it("découpe 14 jours en 2 semaines de 7 jours, tous les jours présents même à 0 h", () => {
    const s = semainesDeLaPeriode(DEBUT, FIN, []);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ numero: 1, debut: "2026-06-01", fin: "2026-06-07", total: 0 });
    expect(s[1]).toMatchObject({ numero: 2, debut: "2026-06-08", fin: "2026-06-14", total: 0 });
    expect(s[0].jours.map((j) => j.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-06", "2026-06-07"]);
    expect(s[1].jours).toHaveLength(7);
  });

  it("range chaque entrée sous son jour, totalise par jour, par semaine et au global", () => {
    const entrees = [
      { date: "2026-06-01", heures: 8, projet_nom: "Dubois" },
      { date: "2026-06-02", heures: 4, projet_nom: "Dubois" },
      { date: "2026-06-02", heures: 4.5, projet_nom: "Tremblay" },   // deux chantiers le même jour
      { date: "2026-06-13", heures: 7.5, projet_nom: "Dubois" },     // samedi, 2e semaine
      { date: "2026-05-31", heures: 9, projet_nom: "Hors période" }, // la veille : ignorée
      { date: "2026-06-15", heures: 9, projet_nom: "Hors période" }, // le lendemain : ignorée
      { date: "2026-06-08T12:00:00", heures: 1, projet_nom: "Avec heure" }, // date avec heure : ramenée au jour
    ];
    const s = semainesDeLaPeriode(DEBUT, FIN, entrees);
    expect(s[0].jours[0]).toMatchObject({ date: "2026-06-01", total: 8 });
    expect(s[0].jours[1].total).toBe(8.5);
    expect(s[0].jours[1].entrees).toHaveLength(2);
    expect(s[0].total).toBe(16.5);
    expect(s[1].jours[0]).toMatchObject({ date: "2026-06-08", total: 1 });
    expect(s[1].jours[5]).toMatchObject({ date: "2026-06-13", total: 7.5 });
    expect(s[1].total).toBe(8.5);
    expect(totalSemaines(s)).toBe(25);
  });

  it("un jour sans saisie reste visible à 0 h — c'est lui qui révèle un oubli", () => {
    const s = semainesDeLaPeriode(DEBUT, FIN, [
      { date: "2026-06-01", heures: 8 }, { date: "2026-06-02", heures: 8 },
      { date: "2026-06-04", heures: 8 }, { date: "2026-06-05", heures: 8 }, // mercredi 3 manquant
    ]);
    const mercredi = s[0].jours.find((j) => j.date === "2026-06-03")!;
    expect(mercredi.total).toBe(0);
    expect(mercredi.entrees).toEqual([]);
    expect(s[0].total).toBe(32);
  });

  it("les flottants ne salissent pas l'affichage (0,1 + 0,2 ≠ 0,30000000000000004)", () => {
    const s = semainesDeLaPeriode(DEBUT, FIN, [{ date: "2026-06-01", heures: 0.1 }, { date: "2026-06-01", heures: 0.2 }]);
    expect(s[0].jours[0].total).toBe(0.3);
  });

  it("période vide ou inversée : rien, pas d'erreur", () => {
    expect(semainesDeLaPeriode("", FIN, [])).toEqual([]);
    expect(semainesDeLaPeriode(FIN, DEBUT, [])).toEqual([]);
  });

  it("une période qui n'est pas un multiple de 7 garde une dernière semaine courte, sans jour inventé", () => {
    const s = semainesDeLaPeriode("2026-06-01", "2026-06-10", []);
    expect(s).toHaveLength(2);
    expect(s[1].jours.map((j) => j.date)).toEqual(["2026-06-08", "2026-06-09", "2026-06-10"]);
  });
});

describe("bilanHeures — où sont passées les heures", () => {
  it("91,5 h travaillées, 80 payées : 11,5 reportées en banque, rien de perdu", () => {
    const b = bilanHeures({ heures_travaillees: 91.5, heures_normales: 80, banque_solde: 11.5 });
    expect(b).toEqual([
      { libelle: "Heures travaillées", heures: 91.5 },
      { libelle: "Heures payées", heures: 80 },
      { libelle: "Reportées en banque d'heures (payables plus tard)", heures: 11.5 },
      { libelle: "Banque d'heures après cette paie (solde)", heures: 11.5 },
    ]);
  });

  it("70 h + 10 h tirées de la banque = 80 payées ; aucune ligne « reportées »", () => {
    const b = bilanHeures({ heures_travaillees: 70, heures_normales: 80, banque_appliquee: 10, banque_solde: 1.5 });
    expect(b.map((l) => l.libelle)).toEqual([
      "Heures travaillées", "Tirées de la banque d'heures", "Heures payées", "Banque d'heures après cette paie (solde)",
    ]);
    expect(b[1].heures).toBe(10);
  });

  it("80 h + 8 h de férié = 80 payées + 8 reportées (le férié compte dans les 80 h)", () => {
    const b = bilanHeures({ heures_travaillees: 80, heures_ferie: 8, heures_normales: 80 });
    expect(b.find((l) => l.libelle.startsWith("Reportées"))?.heures).toBe(8);
    expect(b.find((l) => l.libelle.startsWith("Indemnité"))?.heures).toBe(8);
  });

  it("heuresLisibles écrit la virgule québécoise", () => {
    expect(heuresLisibles(7.5)).toBe("7,50 h");
  });
});
