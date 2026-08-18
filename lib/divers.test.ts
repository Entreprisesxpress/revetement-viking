import { describe, it, expect } from "vitest";
import { toCSV } from "./csv";
import { estDateISO, jourMontreal } from "./date";
import { genererTokenSoumission, verifierTokenSoumission } from "./lien-public";

describe("toCSV (export Excel)", () => {
  it("génère un header + lignes", () => {
    const csv = toCSV([{ a: "1", b: "2" }]);
    expect(csv).toContain("a,b");
    expect(csv).toContain("1,2");
  });
  it("échappe les virgules et guillemets (RFC 4180)", () => {
    const csv = toCSV([{ nom: "Tremblay, Jean", note: 'dit "allo"' }]);
    expect(csv).toContain('"Tremblay, Jean"');
    expect(csv).toContain('"dit ""allo"""');
  });
  it("retourne vide si aucune ligne", () => {
    expect(toCSV([])).toBe("");
  });
});

describe("estDateISO", () => {
  it("accepte YYYY-MM-DD", () => {
    expect(estDateISO("2026-05-25")).toBe(true);
  });
  it("rejette les formats invalides", () => {
    expect(estDateISO("25/05/2026")).toBe(false);
    expect(estDateISO("banane")).toBe(false);
    expect(estDateISO("")).toBe(false);
    expect(estDateISO(null)).toBe(false);
  });
});

describe("jourMontreal (affichage d'un horodatage)", () => {
  it("rend le jour de MONTRÉAL, pas le jour UTC", () => {
    // 17 août 20 h 30 à Montréal = 18 août 00 h 30 UTC. Découper l'ISO donnait « demain ».
    expect(jourMontreal("2026-08-18T00:30:00.000Z")).toBe("2026-08-17");
    // 17 août 21 h à Montréal, dernier instant avant minuit UTC+0 côté serveur
    expect(jourMontreal("2026-08-18T03:59:00.000Z")).toBe("2026-08-17");
    // en pleine journée, aucun décalage
    expect(jourMontreal("2026-08-17T16:00:00.000Z")).toBe("2026-08-17");
  });

  it("laisse une date nue intacte (sinon elle reculerait d'un jour)", () => {
    expect(jourMontreal("2026-08-17")).toBe("2026-08-17");
  });

  it("ne fabrique pas de date à partir de rien", () => {
    expect(jourMontreal("")).toBe("");
    expect(jourMontreal(null)).toBe("");
    expect(jourMontreal(undefined)).toBe("");
    expect(jourMontreal("banane")).toBe("");
  });
});

describe("lien-public (tokens signature soumission)", () => {
  it("génère un token déterministe pour un numéro", async () => {
    const t1 = await genererTokenSoumission("XP-2026-001");
    const t2 = await genererTokenSoumission("XP-2026-001");
    expect(t1).toBe(t2);
    expect(t1.length).toBeGreaterThan(10);
  });
  it("token différent pour numéro différent (anti-énumération)", async () => {
    const t1 = await genererTokenSoumission("XP-2026-001");
    const t2 = await genererTokenSoumission("XP-2026-002");
    expect(t1).not.toBe(t2);
  });
  it("vérifie un token valide et rejette un faux", async () => {
    const t = await genererTokenSoumission("XP-2026-001");
    expect(await verifierTokenSoumission("XP-2026-001", t)).toBe(true);
    expect(await verifierTokenSoumission("XP-2026-001", "faux")).toBe(false);
    expect(await verifierTokenSoumission("XP-2026-002", t)).toBe(false);
  });
});
