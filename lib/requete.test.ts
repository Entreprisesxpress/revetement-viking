import { describe, it, expect } from "vitest";
import { idEntier, lireCorps, texte, bool01, entierBorne } from "./requete";

describe("idEntier — identifiant entier strictement positif", () => {
  it("refuse ce qui n'est pas un entier > 0", () => {
    for (const v of ["abc", "", " ", "1.5", "-1", "1e3", "0", 0, -3, 1.5, NaN, Infinity, null, undefined, {}, [], true, "7a", "0x10", "+7"]) {
      expect(idEntier(v), `valeur ${JSON.stringify(v)}`).toBeNull();
    }
  });
  it("accepte 7 et « 7 » (et les espaces de bord)", () => {
    expect(idEntier(7)).toBe(7);
    expect(idEntier("7")).toBe(7);
    expect(idEntier(" 42 ")).toBe(42);
    expect(idEntier("007")).toBe(7);
  });
});

describe("lireCorps — corps JSON ou null", () => {
  const req = (corps: () => Promise<any>) => ({ json: corps });
  it("corps vide / illisible → null", async () => {
    expect(await lireCorps(req(() => Promise.reject(new SyntaxError("Unexpected end of JSON input"))))).toBeNull();
  });
  it("JSON qui n'est pas un objet → null", async () => {
    expect(await lireCorps(req(async () => null))).toBeNull();
    expect(await lireCorps(req(async () => "abc"))).toBeNull();
    expect(await lireCorps(req(async () => 5))).toBeNull();
  });
  it("objet → l'objet tel quel", async () => {
    expect(await lireCorps(req(async () => ({ id: 3 })))).toEqual({ id: 3 });
  });
});

describe("texte — chaîne bornée, undefined/null préservés", () => {
  it("borne et nettoie", () => {
    expect(texte("  bonjour  ", 200)).toBe("bonjour");
    expect(texte("x".repeat(300), 200)).toHaveLength(200);
    expect(texte(12, 5)).toBe("12");
  });
  it("laisse passer undefined (inchangé) et null (effacé)", () => {
    expect(texte(undefined, 10)).toBeUndefined();
    expect(texte(null, 10)).toBeNull();
  });
});

describe("bool01 / entierBorne", () => {
  it("bool01 : seuls true, 1, « 1 », « true » valent 1", () => {
    for (const v of [true, 1, "1", "true"]) expect(bool01(v)).toBe(1);
    for (const v of [false, 0, "0", "false", "", null, undefined, "oui", 2, "abc"]) expect(bool01(v)).toBe(0);
  });
  it("entierBorne : défaut si illisible, borné sinon", () => {
    expect(entierBorne("abc", 12, 1, 100)).toBe(12);
    expect(entierBorne(undefined, 12, 1, 100)).toBe(12);
    expect(entierBorne("500", 12, 1, 100)).toBe(100);
    expect(entierBorne("-4", 12, 1, 100)).toBe(1);
    expect(entierBorne("7.9", 12, 1, 100)).toBe(7);
  });
});
