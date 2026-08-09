import { describe, it, expect } from "vitest";
import { parserNotesAsana, clientVersNotesAsana, MARQUEUR_SYNC } from "./asana";

describe("parserNotesAsana — nom de la tâche", () => {
  it("garde les prénoms composés (le découpage sur « - » amputait « Jean-François »)", () => {
    const r = parserNotesAsana({ gid: "1", name: "Jean-François Tremblay" });
    expect(r.nom).toBe("Jean-François Tremblay");
  });

  it("garde les noms de compagnie avec tiret", () => {
    expect(parserNotesAsana({ gid: "1", name: "Groupe Sainte-Julie inc." }).nom).toBe("Groupe Sainte-Julie inc.");
  });

  it("ne garde que la première ligne", () => {
    expect(parserNotesAsana({ gid: "1", name: "Marie Lavoie\n450-555-1234" }).nom).toBe("Marie Lavoie");
  });
});

describe("parserNotesAsana — aller-retour des notes", () => {
  it("ne réimporte pas le bloc écrit par l'app", () => {
    const notes = clientVersNotesAsana({
      nom: "Marie Lavoie", adresse: "456 rue Principale", telephone: "450-555-9999",
      courriel: "m@example.com", statut: "prospect", source: "Site web", tags: "Asana",
      notes: "Rappeler après 17h",
    });
    // Ce que l'app a poussé revient tel quel : rien ne doit être réimporté.
    expect(parserNotesAsana({ gid: "1", name: "Marie Lavoie", notes }).notes).toBeUndefined();
  });

  it("conserve ce qui a été ajouté DANS Asana après le marqueur", () => {
    const notes = clientVersNotesAsana({ nom: "Marie Lavoie", notes: "Rappeler après 17h" })
      + "\nAjout fait dans Asana par Gabriel";
    expect(parserNotesAsana({ gid: "1", name: "Marie Lavoie", notes }).notes).toBe("Ajout fait dans Asana par Gabriel");
  });

  it("ne s'imbrique pas sur plusieurs allers-retours", () => {
    let notes = clientVersNotesAsana({ nom: "X", notes: "note d'origine" });
    for (let i = 0; i < 5; i++) {
      const relu = parserNotesAsana({ gid: "1", name: "X", notes });
      notes = clientVersNotesAsana({ nom: "X", notes: relu.notes });
    }
    // Un seul marqueur, jamais une pile de blocs empilés.
    expect(notes.split(MARQUEUR_SYNC).length - 1).toBe(1);
    expect(notes.length).toBeLessThan(200);
  });

  it("garde les vraies notes saisies uniquement dans Asana (aucun marqueur)", () => {
    const r = parserNotesAsana({ gid: "1", name: "X", notes: "Client rencontré sur place, veut du Canexel" });
    expect(r.notes).toBe("Client rencontré sur place, veut du Canexel");
  });
});

describe("parserNotesAsana — extraction", () => {
  it("récupère courriel et adresse", () => {
    const r = parserNotesAsana({ gid: "1", name: "X", notes: "Adresse: 123 rue du Parc, Longueuil\nCourriel: a@b.ca" });
    expect(r.courriel).toBe("a@b.ca");
    expect(r.adresse).toContain("123 rue du Parc");
  });
});
