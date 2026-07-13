import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { creerCookie, utilisateurDuCookie, authConfiguree, DUREE_SESSION_MS } from "./session";

const OLD_ENV = { ...process.env };

function resetEnv() {
  delete process.env.APP_PASSWORD;
  delete process.env.FRANCIS_PASSWORD;
  delete process.env.GABRIEL_PASSWORD;
  delete process.env.SESSION_SECRET;
  (process.env as any).NODE_ENV ="test";
}

beforeEach(resetEnv);
afterEach(() => { process.env = { ...OLD_ENV }; vi.useRealTimers(); });

describe("session — cookies v2 (expiration + signature)", () => {
  it("roundtrip valide → retourne l'utilisateur", async () => {
    process.env.FRANCIS_PASSWORD = "secret-francis";
    const c = await creerCookie("Francis");
    expect(c).toMatch(/^v2\|Francis\|/);
    expect(await utilisateurDuCookie(c!)).toBe("Francis");
  });

  it("signature falsifiée → refusé", async () => {
    process.env.FRANCIS_PASSWORD = "secret-francis";
    const c = (await creerCookie("Francis"))!;
    expect(await utilisateurDuCookie(c.slice(0, -4) + "0000")).toBeNull();
  });

  it("la signature lie l'utilisateur (impossible de changer Francis→Gabriel)", async () => {
    (process.env as any).NODE_ENV ="production";
    process.env.FRANCIS_PASSWORD = "pw-francis";
    process.env.GABRIEL_PASSWORD = "pw-gabriel";
    const c = (await creerCookie("Francis"))!;
    const parts = c.split("|"); parts[1] = "Gabriel"; // usurpation
    expect(await utilisateurDuCookie(parts.join("|"))).toBeNull();
  });

  it("cookie expiré → refusé", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    process.env.FRANCIS_PASSWORD = "secret-francis";
    const c = (await creerCookie("Francis"))!;
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z").getTime() + DUREE_SESSION_MS + 5000);
    expect(await utilisateurDuCookie(c)).toBeNull();
  });
});

describe("session — fail-closed en production", () => {
  it("aucun mot de passe configuré en PROD → refusé", async () => {
    (process.env as any).NODE_ENV ="production";
    expect(await utilisateurDuCookie("v2|Francis|9999999999999|deadbeef")).toBeNull();
    expect(await utilisateurDuCookie("Francis|")).toBeNull();
  });

  it("aucun mot de passe en DEV → accès libre (tolérance locale)", async () => {
    (process.env as any).NODE_ENV ="test"; // != production
    expect(await utilisateurDuCookie("Francis|")).toBe("Francis");
  });
});

describe("session — rotation via SESSION_SECRET", () => {
  it("activer SESSION_SECRET révoque les cookies v2 existants", async () => {
    process.env.FRANCIS_PASSWORD = "secret-francis";
    const c = (await creerCookie("Francis"))!; // signé SANS SESSION_SECRET
    expect(await utilisateurDuCookie(c)).toBe("Francis");
    process.env.SESSION_SECRET = "nouvelle-rotation"; // rotation
    expect(await utilisateurDuCookie(c)).toBeNull();
  });

  it("SESSION_SECRET actif → les anciens cookies v1 (sans expiration) sont refusés", async () => {
    process.env.FRANCIS_PASSWORD = "secret-francis";
    process.env.SESSION_SECRET = "rotation";
    expect(await utilisateurDuCookie("Francis|nimportequoi")).toBeNull();
  });
});

describe("session — authConfiguree", () => {
  it("false si aucun mot de passe, true dès qu'un est présent", async () => {
    expect(authConfiguree()).toBe(false);
    process.env.GABRIEL_PASSWORD = "x";
    expect(authConfiguree()).toBe(true);
  });
});
