import { describe, it, expect } from "vitest";
import { ipClient } from "./ip";

const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } });

describe("ipClient — l'appelant ne choisit pas son IP", () => {
  it("prend le DERNIER x-forwarded-for, jamais le premier (que le client contrôle)", () => {
    expect(ipClient(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    // valeur forgée en tête par l'attaquant : ignorée
    expect(ipClient(req({ "x-forwarded-for": "6.6.6.6,203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("préfère l'en-tête posé par la plateforme", () => {
    expect(ipClient(req({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6, 9.9.9.9" }))).toBe("198.51.100.4");
    expect(ipClient(req({ "x-vercel-forwarded-for": "6.6.6.6, 198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("n'est jamais vide : sans en-tête, « inconnue » (la limite s'applique quand même)", () => {
    expect(ipClient(req({}))).toBe("inconnue");
    expect(ipClient(req({ "x-forwarded-for": " , " }))).toBe("inconnue");
  });
});
