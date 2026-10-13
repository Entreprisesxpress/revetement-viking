import { describe, it, expect } from "vitest";
import { hacherMotDePasse, verifierMotDePasse, motDePasseInvalide, genererJetonReinit, empreinteJeton } from "./mdp";

describe("mots de passe gérés dans l'app (scrypt)", () => {
  it("hache avec un sel différent à chaque fois, et vérifie", () => {
    const h1 = hacherMotDePasse("viking-essai-1");
    const h2 = hacherMotDePasse("viking-essai-1");
    expect(h1).not.toBe(h2);
    expect(h1.startsWith("scrypt$")).toBe(true);
    expect(verifierMotDePasse("viking-essai-1", h1)).toBe(true);
    expect(verifierMotDePasse("viking-essai-1", h2)).toBe(true);
    expect(verifierMotDePasse("viking-essai-2", h1)).toBe(false);
  });
  it("un hachage absent ou mal formé ne correspond jamais", () => {
    expect(verifierMotDePasse("x", null)).toBe(false);
    expect(verifierMotDePasse("x", "")).toBe(false);
    expect(verifierMotDePasse("x", "bcrypt$abc$def")).toBe(false);
    expect(verifierMotDePasse("x", "scrypt$zz$zz")).toBe(false);
  });
  it("règle minimale : 8 caractères", () => {
    expect(motDePasseInvalide("court")).toMatch(/8 caractères/);
    expect(motDePasseInvalide("        ")).toMatch(/vide/);
    expect(motDePasseInvalide("huitcar!")).toBeNull();
    expect(motDePasseInvalide(42)).toMatch(/8 caractères/);
  });
  it("jeton de réinitialisation : 48 hex, empreinte stable, jamais stocké en clair", () => {
    const j = genererJetonReinit();
    expect(j).toMatch(/^[0-9a-f]{48}$/);
    expect(empreinteJeton(j)).toBe(empreinteJeton(j));
    expect(empreinteJeton(j)).not.toBe(j);
    expect(empreinteJeton(j)).toHaveLength(64);
  });
});
