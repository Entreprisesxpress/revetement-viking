import { describe, it, expect } from "vitest";
import { messageProjetComplete, messageSoumissionReponse, destinataireNotifications, COURRIEL_NOTIFICATIONS_DEFAUT, resteAFacturer } from "./notif-projet";

const BASE = {
  id: 42,
  nom: "Rénovation Beloeil",
  numero: "P-2026-014",
  client_nom: "Marie Tremblay",
  adresse_chantier: "120 rue des Pins",
  date_fin_reelle: "2026-08-17",
  prix_contrat: 48000,
  extras_factures: 890,
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

describe("l'avis reste INTERNE", () => {
  it("ne laisse échapper AUCUNE adresse courriel dans le message", () => {
    // Le pire cas : des champs du projet contiennent des adresses. Aucune ne doit
    // ressortir — ni celle du client, ni une autre trouvée en chemin.
    const piege: any = {
      ...BASE,
      total_facture: 0,
      client_nom: "Marie Tremblay",
      client_courriel: "marie@client.ca",   // champ hérité : doit être ignoré
      adresse_chantier: "120 rue des Pins",
    };
    const { sujet, texte } = messageProjetComplete(piege, "https://exemple.ca");
    expect(texte).not.toContain("marie@client.ca");
    expect(texte + sujet).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it("dit noir sur blanc que le client n'a rien reçu", () => {
    const { texte } = messageProjetComplete(BASE);
    expect(texte).toContain("Rappel interne");
    expect(texte).toContain("Le client n'a rien reçu");
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
  it("porte le montant à facturer jusque dans le sujet", () => {
    const { sujet } = messageProjetComplete({ ...BASE, total_facture: 0 });
    expect(sujet).toContain("🧾 Chantier terminé — Rénovation Beloeil (Marie Tremblay)");
    expect(sujet).toContain("à facturer");
  });

  it("nomme qui a fermé le chantier — c'est Gabriel qui ferme, Francis qui facture", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_facture: 0 }, undefined, "Gabriel");
    expect(texte).toContain("marqué terminé par Gabriel");
  });

  it("reste lisible quand on ignore qui a fermé", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_facture: 0 }, undefined, null);
    expect(texte).toContain("vient d'être marqué terminé.");
    expect(texte).not.toContain("par null");
    expect(texte).not.toContain("par ."); // pas de « par » orphelin
  });

  it("réclame la facture en tête, avant le détail", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_facture: 0 });
    expect(texte).toContain("À FACTURER");
    expect(texte.indexOf("À FACTURER")).toBeLessThan(texte.indexOf("Client   :"));
  });

  it("bascule sur l'encaissement quand tout est déjà facturé", () => {
    const { sujet, texte } = messageProjetComplete(BASE); // 48 890 facturés, 20 000 payés
    expect(sujet).not.toContain("à facturer");
    expect(texte).toContain("Déjà facturé");
    expect(texte).toContain("Reste à ENCAISSER");
  });

  it("ne réclame plus rien quand c'est facturé ET encaissé", () => {
    const { texte } = messageProjetComplete({ ...BASE, total_paye: 48890 });
    expect(texte).toContain("Rien à faire");
    expect(texte).not.toContain("À FACTURER");
  });

  it("ne déclenche pas sur un reliquat d'arrondi", () => {
    const r = messageProjetComplete({ ...BASE, total_facture: 48889.999, total_paye: 48889.999 });
    expect(r.texte).toContain("Rien à faire");
    expect(r.sujet).not.toContain("à facturer");
  });

  it("porte l'essentiel du chantier, sans le bilan de rentabilité", () => {
    const { texte } = messageProjetComplete(BASE);
    expect(texte).toContain("120 rue des Pins");
    expect(texte).toContain("P-2026-014");
    expect(texte).toContain("2026-08-17");
    // la marge et les coûts n'ont rien à faire dans un rappel de facturation
    expect(texte).not.toMatch(/Marge|Dépenses|Heures/);
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

describe("messageSoumissionReponse — avis interne quand un client répond en ligne", () => {
  const S = { numero: "XP-20260904-003", client_nom: "Marie Tremblay", client_telephone: "450-123-4567", projet: "Revêtement complet", total: 18450.5 };

  it("acceptation : le sujet dit ACCEPTÉE avec le montant, le corps dit quoi faire", () => {
    const { sujet, texte } = messageSoumissionReponse(S, "accepter", "Marie Tremblay", "https://exemple.ca/");
    expect(sujet).toContain("ACCEPTÉE");
    expect(sujet).toContain("XP-20260904-003");
    // fr-CA sépare les milliers par une espace fine insécable : on compare sur les chiffres
    expect(sujet.replace(/[^\d,]/g, "")).toContain("18450,50");
    expect(texte).toContain("signée en ligne par Marie Tremblay");
    expect(texte).toContain("À FAIRE : préparer le contrat");
    expect(texte).toContain("https://exemple.ca/soumissions/nouveau?modifier=XP-20260904-003");
  });

  it("refus : le sujet dit refusée, le corps propose de rappeler", () => {
    const { sujet, texte } = messageSoumissionReponse(S, "refuser");
    expect(sujet).toContain("refusée");
    expect(texte).toContain("REFUSER");
    expect(texte).toContain("rappeler");
  });

  it("reste interne : aucune adresse courriel dans le message", () => {
    const { sujet, texte } = messageSoumissionReponse({ ...S, client_nom: "X" } as any, "accepter");
    expect(texte + sujet).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(texte).toContain("Rappel interne");
  });
});
