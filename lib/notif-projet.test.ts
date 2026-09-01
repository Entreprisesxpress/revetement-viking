import { describe, it, expect } from "vitest";
import { messageProjetComplete, destinataireNotifications, COURRIEL_NOTIFICATIONS_DEFAUT, resteAFacturer } from "./notif-projet";

const BASE = {
  id: 42,
  nom: "Rénovation Beloeil",
  numero: "P-2026-014",
  client_nom: "Marie Tremblay",
  adresse_chantier: "120 rue des Pins",
  date_debut: "2026-07-02",
  date_fin_reelle: "2026-08-17",
  prix_contrat: 48000,
  extras_factures: 890,
  total_heures: 212.5,
  cout_main_oeuvre: 19125,
  total_depenses: 12480.5,
  marge: 11890.25,
  marge_pct: 27.4,
  total_facture: 48890,
  total_paye: 20000,
};

describe("destinataireNotifications", () => {
  it("vise la boîte interne par défaut", () => {
    expect(destinataireNotifications()).toBe(COURRIEL_NOTIFICATIONS_DEFAUT);
    expect(COURRIEL_NOTIFICATIONS_DEFAUT).toBe("revetementviking@gmail.com");
  });

  it("se laisse rediriger par EMAIL_NOTIFICATIONS", () => {
    process.env.EMAIL_NOTIFICATIONS = "autre@exemple.ca";
    expect(destinataireNotifications()).toBe("autre@exemple.ca");
    // une valeur vide ou en espaces ne doit PAS effacer le destinataire
    process.env.EMAIL_NOTIFICATIONS = "   ";
    expect(destinataireNotifications()).toBe(COURRIEL_NOTIFICATIONS_DEFAUT);
    delete process.env.EMAIL_NOTIFICATIONS;
  });
});

describe("resteAFacturer", () => {
  it("compte le contrat plus les extras, moins ce qui est déjà facturé", () => {
    expect(resteAFacturer({ id: 1, prix_contrat: 48000, extras_factures: 890, total_facture: 0 })).toBe(48890);
    expect(resteAFacturer({ id: 1, prix_contrat: 48000, extras_factures: 890, total_facture: 48890 })).toBe(0);
    expect(resteAFacturer({ id: 1, prix_contrat: 48000, extras_factures: 890, total_facture: 20000 })).toBe(28890);
  });

  it("retombe sur le budget estimé quand il n'y a pas de contrat", () => {
    expect(resteAFacturer({ id: 1, budget_estime: 12000 })).toBe(12000);
  });
});

describe("messageProjetComplete", () => {
  it("porte l'action à faire jusque dans le sujet", () => {
    const { sujet } = messageProjetComplete({ ...BASE, total_facture: 0 });
    expect(sujet).toContain("✅ Chantier terminé — Rénovation Beloeil (Marie Tremblay)");
    expect(sujet).toContain("à facturer");
  });

  it("réclame la facture EN TÊTE du message, avec le courriel du client", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_facture: 0, client_courriel: "marie@exemple.ca" });
    expect(texte).toContain("À FAIRE : envoyer la facture au client");
    expect(texte).toContain("marie@exemple.ca");
    // l'action doit venir AVANT le détail, pas être noyée dedans
    expect(texte.indexOf("À FAIRE")).toBeLessThan(texte.indexOf("Détail du chantier"));
  });

  it("signale l'absence de courriel au dossier au lieu de rester muet", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_facture: 0, client_courriel: null });
    expect(texte).toContain("pas de courriel au dossier");
  });

  it("bascule sur l'encaissement quand tout est déjà facturé", () => {
    const { sujet, texte } = messageProjetComplete(BASE); // 48 890 facturés, 20 000 payés
    expect(sujet).not.toContain("à facturer");
    expect(texte).toContain("Déjà facturé au complet");
    expect(texte).toContain("Reste à ENCAISSER");
  });

  it("ne réclame plus rien quand c'est facturé ET encaissé", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_paye: 48890 });
    expect(texte).toContain("Rien à faire côté facturation");
    expect(texte).not.toContain("À FAIRE");
  });

  it("porte les chiffres du chantier", () => {
    const { texte } = messageProjetComplete(BASE);
    expect(texte).toContain("120 rue des Pins");
    expect(texte).toContain("P-2026-014");
    expect(texte).toContain("2026-08-17");
    expect(texte).toContain("212,5 h");
    expect(texte).toContain("27,4 %".replace(",", ".")); // toFixed rend un point
  });

  it("ne déclenche pas sur un reliquat d'arrondi", () => {
    const r = messageProjetComplete({ ...BASE, total_facture: 48889.999, total_paye: 48889.999 });
    expect(r.texte).toContain("Rien à faire côté facturation");
    expect(r.sujet).not.toContain("à facturer");
  });

  it("tient debout sur un projet presque vide", () => {
    const { sujet, texte } = messageProjetComplete({ id: 7 });
    expect(sujet).toContain("Projet #7");
    expect(sujet).not.toContain("()");        // pas de parenthèses vides sans client
    expect(texte).not.toMatch(/NaN|undefined|null/);
    // sans contrat ni budget, rien à réclamer — pas de « à facturer 0,00 $ »
    expect(sujet).not.toContain("à facturer");
  });

  it("ajoute le lien vers la fiche, sans double barre oblique", () => {
    const { texte } = messageProjetComplete(BASE, "https://exemple.ca/");
    expect(texte).toContain("https://exemple.ca/projets/42");
    expect(texte).not.toContain("//projets");
  });

  it("n'invente pas de lien quand aucune origine n'est fournie", () => {
    expect(messageProjetComplete(BASE).texte).not.toContain("Fiche du chantier");
  });
});
