// La sauvegarde doit pouvoir exporter CHAQUE table qu'elle déclare, sur le schéma réel
// créé par initDb(). Trouvé à l'audit du 2026-10-12 : utilisateur_profil (clé primaire
// `username`) était triée sur `id` → « no such column » → TOUTE la sauvegarde Drive
// répondait 500, et aucun test ne l'attrapait.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dossier = "";
let db: typeof import("./db");

beforeAll(async () => {
  dossier = mkdtempSync(path.join(tmpdir(), "viking-sauvegarde-"));
  process.env.TURSO_URL = `file:${path.join(dossier, "test.db").replace(/\\/g, "/")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  db = await import("./db");
  await db.initDb();
}, 60_000);

afterAll(() => {
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* verrou Windows */ }
});

describe("TABLES_SAUVEGARDE ↔ schéma réel", () => {
  it("chaque table déclarée s'exporte sans erreur (tri et colonnes existent)", async () => {
    const echecs: string[] = [];
    for (const { champ, table, tri, sansColonnes } of db.TABLES_SAUVEGARDE) {
      try {
        const lignes = await db.exporterTable(table, tri, sansColonnes);
        expect(Array.isArray(lignes)).toBe(true);
      } catch (e: any) {
        echecs.push(`${champ} (${table}) : ${e?.message || e}`);
      }
    }
    expect(echecs).toEqual([]);
  });

  it("contenuSauvegarde() réussit sur une base neuve et compte chaque champ", async () => {
    const { donnees, counts } = await db.contenuSauvegarde();
    for (const { champ } of db.TABLES_SAUVEGARDE) {
      expect(donnees[champ], champ).toBeDefined();
      // Certaines tables sont semées par initDb() (catégories de dépense) : un nombre, pas 0.
      expect(counts[champ], champ).toBe(donnees[champ].length);
    }
  });

  it("toute table de la base est soit sauvegardée, soit exclue avec une raison", async () => {
    const r = await db.db().execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    const tables = (r.rows as any[]).map((x) => String(x.name));
    const couvertes = new Set([...db.TABLES_SAUVEGARDE.map((t) => t.table), ...Object.keys(db.TABLES_EXCLUES_SAUVEGARDE)]);
    const oubliees = tables.filter((t) => !couvertes.has(t));
    expect(oubliees).toEqual([]);
  });

  it("detecterConflitsRestauration : même id, contenu différent = conflit ; identique = rien", async () => {
    const id = await db.ajouterEmploye({ nom: "Conflit Test", taux_horaire: 40, das_pct: 0.15 });
    const identique = { employes: [{ id, nom: "Conflit Test", taux_horaire: 40 }] };
    expect(await db.detecterConflitsRestauration(identique)).toEqual([]);
    const different = { employes: [{ id, nom: "Quelqu'un d'autre", taux_horaire: 40 }] };
    expect(await db.detecterConflitsRestauration(different)).toEqual([{ table: "employes", id }]);
    // Un id absent de la base n'est pas un conflit (il sera inséré).
    expect(await db.detecterConflitsRestauration({ employes: [{ id: id + 1000, nom: "Nouveau" }] })).toEqual([]);
  });
});
