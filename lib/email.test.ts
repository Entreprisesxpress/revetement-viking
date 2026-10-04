import { describe, it, expect } from "vitest";
import { emailEstConfigure, enProduction, masquerCourriel, fournisseurCourriel } from "./email";

describe("fournisseurCourriel — une seule décision pour emailEstConfigure() et l'envoi", () => {
  it("Resend utilisable (clé + expéditeur en prod) → resend, même si Gmail est aussi prêt", () => {
    expect(fournisseurCourriel({ RESEND_API_KEY: "re_x", RESEND_FROM: "c@viking.com", VERCEL: "1", GMAIL_USER: "x@gmail.com", GMAIL_APP_PASSWORD: "p" } as any)).toBe("resend");
    expect(fournisseurCourriel({ RESEND_API_KEY: "re_x", NODE_ENV: "development" } as any)).toBe("resend");
  });

  it("Resend sans RESEND_FROM en production : bascule sur Gmail s'il est prêt (le cas qui échouait)", () => {
    // Avant : emailEstConfigure disait oui (Gmail prêt) et envoyer() prenait Resend → échec.
    const env = { RESEND_API_KEY: "re_x", VERCEL: "1", GMAIL_USER: "x@gmail.com", GMAIL_APP_PASSWORD: "p" } as any;
    expect(fournisseurCourriel(env)).toBe("gmail");
    expect(emailEstConfigure(env)).toBe(true);
  });

  it("Resend inutilisable et pas de Gmail → null, et emailEstConfigure dit non", () => {
    const env = { RESEND_API_KEY: "re_x", VERCEL: "1" } as any;
    expect(fournisseurCourriel(env)).toBeNull();
    expect(emailEstConfigure(env)).toBe(false);
    expect(fournisseurCourriel({} as any)).toBeNull();
  });

  it("Gmail à moitié configuré (sans mot de passe) ne compte pas", () => {
    expect(fournisseurCourriel({ GMAIL_USER: "x@gmail.com" } as any)).toBeNull();
  });
});

describe("emailEstConfigure — l'app ne promet un envoi que si elle peut le tenir", () => {
  it("Resend sans RESEND_FROM en production = NON configuré (les écrans retombent sur Gmail/mailto)", () => {
    expect(emailEstConfigure({ RESEND_API_KEY: "re_x", VERCEL: "1" } as any)).toBe(false);
    expect(emailEstConfigure({ RESEND_API_KEY: "re_x", NODE_ENV: "production" } as any)).toBe(false);
  });

  it("Resend avec RESEND_FROM en production = configuré", () => {
    expect(emailEstConfigure({ RESEND_API_KEY: "re_x", RESEND_FROM: "contrats@revetementviking.com", VERCEL: "1" } as any)).toBe(true);
  });

  it("hors production, la clé Resend suffit (expéditeur d'essai toléré)", () => {
    expect(emailEstConfigure({ RESEND_API_KEY: "re_x", NODE_ENV: "development" } as any)).toBe(true);
  });

  it("Gmail SMTP reste un fournisseur à part entière ; rien du tout = non configuré", () => {
    expect(emailEstConfigure({ GMAIL_USER: "x@gmail.com", GMAIL_APP_PASSWORD: "abcd", VERCEL: "1" } as any)).toBe(true);
    expect(emailEstConfigure({} as any)).toBe(false);
  });

  it("enProduction et masquerCourriel", () => {
    expect(enProduction({ VERCEL: "1" } as any)).toBe(true);
    expect(enProduction({ NODE_ENV: "test" } as any)).toBe(false);
    expect(masquerCourriel("julie@exemple.ca")).toBe("j***@exemple.ca");
  });
});
