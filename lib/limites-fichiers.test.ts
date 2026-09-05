import { describe, it, expect } from "vitest";
import {
  LIMITE_FICHIER_OCTETS, LIMITE_ENCODEE_OCTETS, fichierTropLourd, donneesTropLourdes, poidsLisible,
} from "./limites-fichiers";

const VERCEL_CORPS_MAX = 4.5 * 1024 * 1024;

describe("limites de fichiers — cohérentes avec le plafond Vercel (4,5 Mo par corps)", () => {
  it("un fichier à la limite, encodé en base64 avec son enveloppe JSON, passe sous 4,5 Mo", () => {
    const encode = Math.ceil(LIMITE_FICHIER_OCTETS / 3) * 4 + 64 * 1024; // base64 + ~64 Ko de JSON autour
    expect(encode).toBeLessThan(VERCEL_CORPS_MAX);
  });

  it("le plafond serveur sur la chaîne encodée est lui aussi sous 4,5 Mo (notre message, pas le 413)", () => {
    expect(LIMITE_ENCODEE_OCTETS).toBeLessThan(VERCEL_CORPS_MAX);
    // et il laisse passer un fichier à la limite côté écran
    expect(Math.ceil(LIMITE_FICHIER_OCTETS / 3) * 4 + 40).toBeLessThan(LIMITE_ENCODEE_OCTETS);
  });

  it("fichierTropLourd : null sous la limite, message nommant le fichier au-dessus", () => {
    expect(fichierTropLourd({ size: LIMITE_FICHIER_OCTETS })).toBeNull();
    expect(fichierTropLourd({ size: 10 })).toBeNull();
    const m = fichierTropLourd({ size: 5 * 1024 * 1024, name: "plan.pdf" });
    expect(m).toContain("plan.pdf");
    expect(m).toContain("5.0 Mo");
    expect(m).toContain("3 Mo");
  });

  it("donneesTropLourdes : seule une chaîne au-delà du plafond est refusée", () => {
    expect(donneesTropLourdes("x".repeat(100))).toBe(false);
    expect(donneesTropLourdes("x".repeat(LIMITE_ENCODEE_OCTETS + 1))).toBe(true);
    expect(donneesTropLourdes(undefined)).toBe(false);
    expect(donneesTropLourdes(null)).toBe(false);
  });

  it("poidsLisible", () => {
    expect(poidsLisible(0)).toBe("0 Ko");
    expect(poidsLisible(500)).toBe("1 Ko");
    expect(poidsLisible(300 * 1024)).toBe("300 Ko");
    expect(poidsLisible(3.25 * 1024 * 1024)).toBe("3.3 Mo");
  });
});
