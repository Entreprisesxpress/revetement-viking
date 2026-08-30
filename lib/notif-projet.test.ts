import { describe, it, expect } from "vitest";
import { messageProjetComplete, destinataireNotifications, COURRIEL_NOTIFICATIONS_DEFAUT } from "./notif-projet";

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

describe("messageProjetComplete", () => {
  it("nomme le chantier et le client dans le sujet", () => {
    const { sujet } = messageProjetComplete(BASE);
    expect(sujet).toBe("✅ Chantier complété — Rénovation Beloeil (Marie Tremblay)");
  });

  it("porte les chiffres du chantier", () => {
    const { texte } = messageProjetComplete(BASE);
    expect(texte).toContain("120 rue des Pins");
    expect(texte).toContain("P-2026-014");
    expect(texte).toContain("2026-08-17");
    expect(texte).toContain("212,5 h");
    expect(texte).toContain("27,4 %".replace(",", ".")); // toFixed rend un point
  });

  it("réclame le solde quand tout n'est pas encaissé", () => {
    const { texte } = messageProjetComplete(BASE);
    expect(texte).toContain("Reste à encaisser");
    // 48 890 facturés - 20 000 encaissés = 28 890
    expect(texte.replace(/ | /g, " ")).toContain("28 890");
  });

  it("ne réclame rien quand c'est payé au complet", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_paye: 48890 });
    expect(texte).not.toContain("Reste à encaisser");
    expect(texte).toContain("Encaissé");
  });

  it("ne déclenche pas sur un reliquat d'arrondi", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_facture: 48890, total_paye: 48889.999 });
    expect(texte).not.toContain("Reste à encaisser");
  });

  it("tient debout sur un projet presque vide", () => {
    const { sujet, texte } = messageProjetComplete({ id: 7 });
    expect(sujet).toContain("Projet #7");
    expect(sujet).not.toContain("()");        // pas de parenthèses vides sans client
    expect(texte).not.toMatch(/NaN|undefined|null/);
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
