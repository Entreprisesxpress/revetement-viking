// Les `modifierX` / `supprimerX` de lib/db.ts renvoient `false` quand l'id ne pointe sur
// rien (0 ligne touchée) : la route répond alors 404 au lieu d'un `{ok:true}` sans effet
// (mesuré : PATCH /api/cameras {id:"1.5"} → ok sans rien écrire).
// Base SQLite TEMPORAIRE propre à ce test (motif de lib/db-isole.test.ts) : jamais
// data/soumissions.db ni la base de production.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dossier = "";
let db: typeof import("./db");

beforeAll(async () => {
  dossier = mkdtempSync(path.join(tmpdir(), "viking-test-introuvable-"));
  process.env.TURSO_URL = `file:${path.join(dossier, "test.db").replace(/\\/g, "/")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  db = await import("./db");
  await db.initDb();
}, 60_000);

afterAll(() => {
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* verrou Windows : purgé par l'OS */ }
});

const ID_INEXISTANT = 987_654_321;

describe("modifierX / supprimerX : 0 ligne touchée → false, 1 ligne → true", () => {
  it("modifierVehicule : id inexistant → false ; véhicule réel → true", async () => {
    expect(await db.modifierVehicule(ID_INEXISTANT, { nom: "Fantôme" })).toBe(false);
    const id = await db.ajouterVehicule({ nom: "Camion test", annee: 2020 });
    expect(await db.modifierVehicule(id, { nom: "Camion test 2" })).toBe(true);
    // Aucun champ connu : rien à écrire, mais ce n'est pas « introuvable ».
    expect(await db.modifierVehicule(id, {})).toBe(true);
    expect(await db.supprimerVehicule(id)).toBe(true);
    expect(await db.supprimerVehicule(id)).toBe(false);
  });

  it("modifierEmploye : id inexistant → false ; booléens coercés en 0/1", async () => {
    expect(await db.modifierEmploye(ID_INEXISTANT, { nom: "Personne" })).toBe(false);
    const id = await db.ajouterEmploye({ nom: "Test Introuvable", taux_horaire: 30 });
    expect(await db.modifierEmploye(id, { actif: "abc" as any, recoit_talon: "true" as any })).toBe(true);
    const e = await db.getEmploye(id);
    expect(Number(e?.actif)).toBe(0);
    expect(Number(e?.recoit_talon)).toBe(1);
    expect(await db.modifierEmploye(id, { actif: 1 })).toBe(true);
    expect(Number((await db.getEmploye(id))?.actif)).toBe(1);
  });

  it("supprimerAssurance / supprimerInteraction / supprimerTache : id inexistant → false", async () => {
    expect(await db.supprimerAssurance(ID_INEXISTANT)).toBe(false);
    expect(await db.supprimerInteraction(ID_INEXISTANT)).toBe(false);
    expect(await db.supprimerTache(ID_INEXISTANT)).toBe(false);
    expect(await db.modifierTache(ID_INEXISTANT, { titre: "x" })).toBe(false);
  });

  it("changerStatut : numéro inexistant → false", async () => {
    expect(await db.changerStatut("XP-00000000-999", "envoyee")).toBe(false);
  });

  it("compterOngletsProjet : zéros sur un projet sans extras/documents/notes", async () => {
    const id = await db.ajouterProjet({ nom: "Projet compteurs" });
    expect(await db.compterOngletsProjet(id)).toEqual({ nb_extras: 0, nb_documents: 0, nb_notes: 0 });
    await db.ajouterExtra({ projet_id: id, date: "2026-10-01", description: "Extra test", montant: 10 });
    expect((await db.compterOngletsProjet(id)).nb_extras).toBe(1);
  });
});
