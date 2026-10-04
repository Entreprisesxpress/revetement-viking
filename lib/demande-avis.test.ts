import { describe, it, expect } from "vitest";
import {
  messageDemandeAvis, prenomClient, urlGmailDemandeAvis, urlMailtoDemandeAvis, estAppareilTactile,
  LIEN_AVIS_GOOGLE, SUJET_DEMANDE_AVIS, VIKING_EMAIL,
} from "./demande-avis";

describe("demande d'avis Google", () => {
  it("salue le client par son prénom, ou sans nom", () => {
    expect(prenomClient("Julie Tremblay")).toBe("Julie");
    expect(prenomClient("  ")).toBe("");
    expect(messageDemandeAvis("Julie Tremblay").startsWith("Bonjour Julie,")).toBe(true);
    expect(messageDemandeAvis(null).startsWith("Bonjour,")).toBe(true);
  });

  it("ne salue ni une civilité ni une particule comme un prénom", () => {
    // « Bonjour M., » et « Bonjour Les, » sont ce que recevaient les clients.
    expect(prenomClient("M. Tremblay")).toBe("");
    expect(prenomClient("Mme Gagnon")).toBe("");
    expect(prenomClient("Mr Smith")).toBe("");
    expect(prenomClient("Dr. Roy")).toBe("");
    expect(prenomClient("Les Jardins du Nord")).toBe("");
    expect(prenomClient("Le Groupe Maçonnerie")).toBe("");
    expect(prenomClient("La Maison Blanche")).toBe("");
    expect(prenomClient("L'Entrepôt du Nord")).toBe("");
    expect(messageDemandeAvis("M. Tremblay").startsWith("Bonjour,\n")).toBe(true);
  });

  it("une entreprise (inc., ltée, enr., s.e.n.c.) est saluée sans prénom", () => {
    expect(prenomClient("Les Constructions ABC inc.")).toBe("");
    expect(prenomClient("Toiture Morin Ltée")).toBe("");
    expect(prenomClient("Rénovations Côté enr.")).toBe("");
    expect(prenomClient("Dubois et Fils s.e.n.c.")).toBe("");
    expect(messageDemandeAvis("Constructions ABC inc.").startsWith("Bonjour,\n")).toBe(true);
    // Un vrai prénom reste salué : « Marc Inc » n'est pas un cas réel, mais « Marc » l'est.
    expect(prenomClient("Marc-Antoine Lévesque")).toBe("Marc-Antoine");
  });

  it("le message porte le lien Google, le courriel et le téléphone Viking", () => {
    const m = messageDemandeAvis("Marc");
    expect(m).toContain(LIEN_AVIS_GOOGLE);
    expect(m).toContain(VIKING_EMAIL);
    expect(m).toContain("(438) 493-2041");
    expect(m).not.toContain("entreprisesxpress");
  });

  it("le lien mailto: ouvre l'app courriel avec destinataire, sujet et corps", () => {
    const u = urlMailtoDemandeAvis("client@exemple.ca", "Julie Tremblay");
    expect(u.startsWith("mailto:client%40exemple.ca?subject=")).toBe(true);
    expect(decodeURIComponent(u)).toContain(SUJET_DEMANDE_AVIS);
    expect(decodeURIComponent(u)).toContain("Bonjour Julie,");
  });

  it("la composition Gmail présélectionne le compte Viking et le destinataire", () => {
    const u = new URL(urlGmailDemandeAvis("client@exemple.ca", "Julie"));
    expect(u.hostname).toBe("mail.google.com");
    expect(u.searchParams.get("authuser")).toBe(VIKING_EMAIL);
    expect(u.searchParams.get("to")).toBe("client@exemple.ca");
    expect(u.searchParams.get("view")).toBe("cm");
    expect(u.searchParams.get("body")).toContain(LIEN_AVIS_GOOGLE);
  });

  it("reconnaît un téléphone (tactile + agent mobile), pas un portable tactile Windows", () => {
    expect(estAppareilTactile({ maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(true);
    expect(estAppareilTactile({ maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile" })).toBe(true);
    expect(estAppareilTactile({ maxTouchPoints: 10, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
    expect(estAppareilTactile({ maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Macintosh)" })).toBe(false);
    expect(estAppareilTactile(undefined)).toBe(false);
  });
});
