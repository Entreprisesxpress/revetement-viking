import { describe, it, expect } from "vitest";
import { estEmailNonConfigure, urlMailtoContrat, urlGmailContrat, messageContrat } from "./courriel-contrat";
import { envoyer } from "./envoi";

describe("repli courriel d'un contrat (serveur sans courriel configuré)", () => {
  it("reconnaît le `{ ok:false, raison:\"email_non_configure\" }` que l'API renvoie en 200", () => {
    expect(estEmailNonConfigure({ ok: false, raison: "email_non_configure" })).toBe(true);
    expect(estEmailNonConfigure({ ok: false, error: "fournisseur en panne" })).toBe(false);
    expect(estEmailNonConfigure({ ok: true, messageId: "x" })).toBe(false);
    expect(estEmailNonConfigure(undefined)).toBe(false);
    expect(estEmailNonConfigure("email_non_configure")).toBe(false);
  });

  it("vu à travers envoyer() : le corps reste lisible dans `data` même si ok vaut false (V-29)", async () => {
    // Avant, les écrans lisaient `d.raison` sur `{ error: res.erreur }` : jamais atteint.
    (globalThis as any).fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, raison: "email_non_configure" }) });
    const r = await envoyer("/api/contrats-pipeline/abc/envoyer", { corps: { to: "a@b.ca" } });
    expect(r.ok).toBe(false);
    expect(estEmailNonConfigure(r.data)).toBe(true);
  });

  it("le lien mailto: porte le destinataire, le numéro et le lien de signature, encodés", () => {
    const u = urlMailtoContrat("julie@exemple.com", "C-2026-007", "Julie Roy", "https://app.test/contrat/tok123");
    expect(u.startsWith("mailto:julie%40exemple.com?subject=")).toBe(true);
    expect(decodeURIComponent(u)).toContain("C-2026-007");
    expect(decodeURIComponent(u)).toContain("https://app.test/contrat/tok123");
    expect(decodeURIComponent(u)).toContain("Bonjour Julie Roy,");
  });

  it("le lien Gmail présélectionne le compte Viking et le destinataire", () => {
    const u = urlGmailContrat("julie@exemple.com", "C-2026-007", "Julie Roy", "https://app.test/contrat/tok123");
    expect(u).toContain("authuser=revetementviking%40gmail.com");
    expect(u).toContain("to=julie%40exemple.com");
    expect(u).toContain("view=cm");
  });

  it("le message contient le lien tel quel (le client doit pouvoir cliquer)", () => {
    expect(messageContrat("Julie", "https://app.test/contrat/tok")).toContain("\nhttps://app.test/contrat/tok\n");
  });
});
