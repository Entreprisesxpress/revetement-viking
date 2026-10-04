// Tests qui ÉCRIVENT en base : ils ouvrent leur PROPRE base SQLite temporaire (TURSO_URL
// posé sur un fichier jetable AVANT d'importer lib/db), jamais data/soumissions.db ni
// la base de production. Le schéma complet est créé par initDb() (toutes les migrations).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { periodeBiHebdo } from "./calculs";

let dossier = "";
let db: typeof import("./db");
let idem: typeof import("./idempotence");

beforeAll(async () => {
  dossier = mkdtempSync(path.join(tmpdir(), "viking-test-"));
  process.env.TURSO_URL = `file:${path.join(dossier, "test.db").replace(/\\/g, "/")}`;
  delete process.env.TURSO_AUTH_TOKEN;
  db = await import("./db");
  idem = await import("./idempotence");
  await db.initDb();
}, 60_000);

afterAll(() => {
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* verrou Windows : le dossier temporaire sera purgé par l'OS */ }
});

describe("idempotence (table + helper avecIdempotence)", () => {
  const { NextRequest, NextResponse } = require("next/server") as typeof import("next/server");
  const requete = (cle?: string) => new NextRequest("http://localhost/api/heures", { method: "POST", headers: cle ? { "X-Idempotence-Cle": cle } : {} });

  it("sans en-tête : le handler s'exécute à chaque appel", async () => {
    let n = 0;
    const h = async () => { n++; return NextResponse.json({ ok: true, id: n }); };
    await idem.avecIdempotence(requete(), h);
    await idem.avecIdempotence(requete(), h);
    expect(n).toBe(2);
  });

  it("avec la même clé : la 2e requête rejoue la réponse stockée sans réexécuter", async () => {
    let n = 0;
    const h = async () => { n++; return NextResponse.json({ ok: true, id: 41 + n }, { status: 201 }); };
    const r1 = await idem.avecIdempotence(requete("cle-a"), h);
    const r2 = await idem.avecIdempotence(requete("cle-a"), h);
    expect(n).toBe(1);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(await r2.json()).toEqual({ ok: true, id: 42 });
    expect(r2.headers.get("X-Idempotence-Rejouee")).toBe("1");
    expect(await r1.json()).toEqual({ ok: true, id: 42 }); // la réponse d'origine reste lisible
  });

  it("un refus (4xx) n'est PAS mémorisé : la même clé peut être renvoyée corrigée", async () => {
    let n = 0;
    const h = async () => { n++; return n === 1 ? NextResponse.json({ error: "x" }, { status: 400 }) : NextResponse.json({ ok: true }); };
    const r1 = await idem.avecIdempotence(requete("cle-b"), h);
    const r2 = await idem.avecIdempotence(requete("cle-b"), h);
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(200);
    expect(n).toBe(2);
  });

  it("la clé est propre à la ROUTE : même clé sur /api/depenses ne rejoue pas /api/heures", async () => {
    let n = 0;
    const h = async () => { n++; return NextResponse.json({ ok: true }); };
    await idem.avecIdempotence(requete("cle-c"), h);
    await idem.avecIdempotence(new NextRequest("http://localhost/api/depenses", { method: "POST", headers: { "X-Idempotence-Cle": "cle-c" } }), h);
    expect(n).toBe(2);
  });

  it("clé mal formée → 400 sans exécuter", async () => {
    let n = 0;
    const r = await idem.avecIdempotence(requete("a".repeat(65)), async () => { n++; return NextResponse.json({ ok: true }); });
    expect(r.status).toBe(400);
    expect(n).toBe(0);
    const r2 = await idem.avecIdempotence(requete("espace interdit"), async () => { n++; return NextResponse.json({ ok: true }); });
    expect(r2.status).toBe(400);
  });

  it("purge : une entrée de plus de 7 jours disparaît, une récente reste", async () => {
    await db.ecrireIdempotence("/x|vieille", 200, "{}");
    await db.db().execute({ sql: "UPDATE idempotence SET cree_le = ? WHERE cle = ?", args: [new Date(Date.now() - 8 * 86400000).toISOString(), "/x|vieille"] });
    await db.ecrireIdempotence("/x|recente", 200, "{}");
    expect(await db.purgerIdempotence(7)).toBeGreaterThanOrEqual(1);
    expect(await db.lireIdempotence("/x|vieille")).toBeNull();
    expect(await db.lireIdempotence("/x|recente")).not.toBeNull();
  });
});

describe("contrats en ligne : numéro séquentiel unique et rattachement du projet par id", () => {
  it("genererNumeroContratPipeline : MAX+1 dans l'année, même après un ancien numéro C-année-client", async () => {
    const annee = new Date().getFullYear();
    const clientId = await db.ajouterClient({ nom: "Client Test Contrats" } as any);
    // Ancien format : C-2026-007 (client_id 7). Le prochain doit être > 007, jamais 007.
    await db.creerContratPipeline({ client_id: clientId, numero: `C-${annee}-007`, token: "tok-ancien", data_json: {}, pdf_brouillon: "" });
    const n1 = await db.genererNumeroContratPipeline();
    expect(n1).toBe(`C-${annee}-008`);
    await db.creerContratPipeline({ client_id: clientId, numero: n1, token: "tok-n1", data_json: {}, pdf_brouillon: "" });
    expect(await db.genererNumeroContratPipeline()).toBe(`C-${annee}-009`);
  });

  it("deux contrats signés du MÊME client avec le MÊME numéro donnent DEUX projets (plus d'écrasement)", async () => {
    const clientId = await db.ajouterClient({ nom: "Client Deux Contrats" } as any);
    const numero = "C-2025-003"; // ancien format non unique, tel qu'il existe en base
    const idA = await db.creerContratPipeline({ client_id: clientId, numero, token: "tok-A", data_json: { nom_projet: "Chantier A", prix_total: 1000 }, pdf_brouillon: "" });
    const idB = await db.creerContratPipeline({ client_id: clientId, numero, token: "tok-B", data_json: { nom_projet: "Chantier B", prix_total: 2000 }, pdf_brouillon: "" });
    for (const t of ["tok-A", "tok-B"]) {
      expect(await db.signerContratPipeline(t, { signature_dataurl: "data:image/png;base64,AA==", signature_nom: "Test", pdf_signe: "" })).toBe(true);
    }
    const rA = await db.creerProjetDepuisContrat("tok-A");
    const rB = await db.creerProjetDepuisContrat("tok-B");
    expect(rA.ok && rB.ok).toBe(true);
    expect(rA.cree).toBe(true);
    expect(rB.cree).toBe(true);
    expect(rA.projet_id).not.toBe(rB.projet_id);
    const pA = await db.getProjet(rA.projet_id!);
    const pB = await db.getProjet(rB.projet_id!);
    expect(pA?.nom).toBe("Chantier A");
    expect(pB?.nom).toBe("Chantier B");
    expect(pA?.prix_contrat).toBe(1000);
    expect(pB?.prix_contrat).toBe(2000);
    expect((pA as any)?.contrat_pipeline_id ?? (await db.db().execute({ sql: "SELECT contrat_pipeline_id AS c FROM projets WHERE id = ?", args: [rA.projet_id!] })).rows[0].c).toBe(idA);
    expect((await db.db().execute({ sql: "SELECT contrat_pipeline_id AS c FROM projets WHERE id = ?", args: [rB.projet_id!] })).rows[0].c).toBe(idB);
    // Rejouer la signature du contrat A retrouve SON projet (idempotent), pas un 3e.
    const rA2 = await db.creerProjetDepuisContrat("tok-A");
    expect(rA2.projet_id).toBe(rA.projet_id);
    expect(rA2.cree).toBe(false);
  });
});

describe("factures : numéro généré MAX+1, numéro pris refusé, montant_paye", () => {
  it("génère F-001 puis F-002, ne retombe jamais sur un numéro pris, et montant_paye suit « payée »", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Factures" });
    const f1 = await db.ajouterFactureProjet({ projet_id: pid, montant: 100, date: "2026-09-01" });
    const f2 = await db.ajouterFactureProjet({ projet_id: pid, montant: 200, date: "2026-09-02", numero: "F-010" });
    const f3 = await db.ajouterFactureProjet({ projet_id: pid, montant: 300, date: "2026-09-03" });
    const liste = await db.listerFacturesProjet(pid);
    const num = (id: number) => liste.find((f) => f.id === id)!.numero;
    expect(num(f1)).toBe("F-001");
    expect(num(f2)).toBe("F-010");
    expect(num(f3)).toBe("F-011"); // MAX+1, pas COUNT+1 (qui aurait redonné F-003… puis F-010 en double)
    expect(await db.numeroFactureExiste("F-010")).toBe(true);
    expect(await db.numeroFactureExiste("F-999")).toBe(false);
    expect(Number(liste.find((f) => f.id === f1)!.montant_paye)).toBe(0);
    await db.marquerFacturePayee(f1, "2026-09-10");
    expect(Number((await db.listerFacturesProjet(pid)).find((f) => f.id === f1)!.montant_paye)).toBe(100);
    await db.annulerPaiementFacture(f1);
    expect(Number((await db.listerFacturesProjet(pid)).find((f) => f.id === f1)!.montant_paye)).toBe(0);
  });
});

describe("cascades transactionnelles (M3) et gardes de la couche données", () => {
  it("supprimerProjet : heures, dépenses, factures, photos, extras et documents disparaissent ; tâches et contrats détachés", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet à supprimer" });
    await db.ajouterEmploye({ nom: "Testeur Cascade", taux_horaire: 30 } as any);
    await db.ajouterHeureProjet({ projet_id: pid, date: "2026-09-01", heures: 4, employe: "Testeur Cascade", taux_horaire: 30 });
    await db.ajouterDepenseProjet({ projet_id: pid, date: "2026-09-01", montant: 50 });
    await db.ajouterFactureProjet({ projet_id: pid, montant: 100, date: "2026-09-01" });
    await db.ajouterPhotoChantier({ projet_id: pid, date: "2026-09-01", photo_data: "data:image/png;base64,AA==" });
    await db.ajouterExtra({ projet_id: pid, date: "2026-09-01", description: "extra" });
    await db.ajouterFichierProjet({ projet_id: pid, nom: "permis.pdf", type: "application/pdf", data: "data:application/pdf;base64,AA==" });
    const tid = await db.ajouterTache({ titre: "Tâche liée", projet_id: pid });
    const r = await db.supprimerProjet(pid);
    expect(r.ok).toBe(true);
    expect(await db.getProjet(pid)).toBeNull();
    for (const t of ["heures_projet", "depenses_projet", "factures_projet", "photos_chantier", "extras", "projet_fichiers"]) {
      const n = (await db.db().execute({ sql: `SELECT COUNT(*) AS n FROM ${t} WHERE projet_id = ?`, args: [pid] })).rows[0] as any;
      expect(Number(n.n), t).toBe(0);
    }
    const tache = (await db.db().execute({ sql: "SELECT projet_id FROM taches_client WHERE id = ?", args: [tid] })).rows[0] as any;
    expect(tache.projet_id).toBeNull();
  });

  it("supprimerProjet refuse quand un contrat signé est joint (rien n'est effacé)", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet avec contrat" });
    await db.modifierProjet(pid, { contrat_signe_data: "data:application/pdf;base64,AA==", contrat_signe_type: "application/pdf" } as any);
    await db.ajouterDepenseProjet({ projet_id: pid, date: "2026-09-01", montant: 5 });
    const r = await db.supprimerProjet(pid);
    expect(r.ok).toBe(false);
    expect((await db.listerDepensesProjet(pid)).length).toBe(1);
  });

  it("terminerTache : clôture + prochaine occurrence dans la même transaction", async () => {
    const id = await db.ajouterTache({ titre: "Récurrente", date_due: "2026-09-07", recurrence: "hebdo" });
    const r = await db.terminerTache(id, "2026-09-07");
    expect(r.prochaine).toBeGreaterThan(0);
    const rows = (await db.db().execute({ sql: "SELECT id, statut, date_due FROM taches_client WHERE id IN (?, ?) ORDER BY id", args: [id, r.prochaine!] })).rows as any[];
    expect(rows[0].statut).toBe("complete");
    expect(rows[1].statut).toBe("a_faire");
    expect(rows[1].date_due).toBe("2026-09-14");
    // Sans récurrence : pas de nouvelle tâche.
    const id2 = await db.ajouterTache({ titre: "Unique" });
    expect(await db.terminerTache(id2, "2026-09-07")).toEqual({});
  });

  it("supprimer(soumission) coupe les liens des projets et contrats", async () => {
    const numero = await db.sauvegarder({ client: { nom: "Client S" }, total: 100, data: {} });
    const pid = await db.ajouterProjet({ nom: "Projet lié", soumission_numero: numero });
    await db.supprimer(numero);
    expect(await db.charger(numero)).toBeNull();
    expect((await db.getProjet(pid))?.soumission_numero).toBeNull();
  });

  it("ajouterHeureProjet exige un taux (plus de repli à 90 $/h)", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet sans taux" });
    await expect(db.ajouterHeureProjet({ projet_id: pid, date: "2026-09-01", heures: 1, employe: "X" })).rejects.toMatchObject({ code: "TAUX_REQUIS" });
    await expect(db.ajouterHeureProjet({ projet_id: pid, date: "2026-09-01", heures: 1, employe: "X", taux_horaire: 0 })).rejects.toMatchObject({ code: "TAUX_REQUIS" });
  });

  it("nettoyerPayePeriodesOrphelines (M14) : aucune heure lue → ne supprime RIEN", async () => {
    // Base isolée : on vide les heures pour simuler une lecture qui ne renvoie aucune ligne.
    await db.db().execute("DELETE FROM heures_projet");
    await db.db().execute({ sql: "INSERT OR IGNORE INTO paies_periodes (employe, debut, fin, paye, date_creation) VALUES ('Fantôme', '2026-06-01', '2026-06-14', 0, ?)", args: [new Date().toISOString()] });
    const avant = Number(((await db.db().execute("SELECT COUNT(*) AS n FROM paies_periodes WHERE paye = 0")).rows[0] as any).n);
    expect(avant).toBeGreaterThan(0);
    expect(await db.nettoyerPayePeriodesOrphelines()).toBe(0);
    const apres = Number(((await db.db().execute("SELECT COUNT(*) AS n FROM paies_periodes WHERE paye = 0")).rows[0] as any).n);
    expect(apres).toBe(avant);
  });

  it("inventaire (M4) : UPDATE conditionnel + mouvement « WHERE changes() = 1 » dans un lot — refus atomique, aucun mouvement fantôme", async () => {
    const c = db.db();
    const now = new Date().toISOString();
    const ins = await c.execute({ sql: "INSERT INTO inventaire (nom, quantite, unite, date_creation, date_modif) VALUES ('Vis', 3, 'bte', ?, ?)", args: [now, now] });
    const id = Number(ins.lastInsertRowid);
    const lot = (delta: number) => c.batch([
      { sql: "UPDATE inventaire SET quantite = quantite + ?, date_modif = ? WHERE id = ? AND quantite + ? >= 0", args: [delta, now, id, delta] },
      { sql: "INSERT INTO inventaire_mouvements (inventaire_id, delta, type, note, par, date_creation) SELECT ?, ?, ?, NULL, 'test', ? WHERE changes() = 1", args: [id, delta, delta > 0 ? "entree" : "sortie", now] },
    ], "write");
    const ok = await lot(-2);
    expect(Number(ok[0].rowsAffected)).toBe(1);
    const refus = await lot(-5); // 1 en stock : refusé, et AUCUN mouvement écrit
    expect(Number(refus[0].rowsAffected)).toBe(0);
    const q = (await c.execute({ sql: "SELECT quantite FROM inventaire WHERE id = ?", args: [id] })).rows[0] as any;
    expect(Number(q.quantite)).toBe(1);
    const mvts = (await c.execute({ sql: "SELECT delta FROM inventaire_mouvements WHERE inventaire_id = ?", args: [id] })).rows as any[];
    expect(mvts.map((m) => Number(m.delta))).toEqual([-2]);
  });

  it("detecterPertesLignes : signale une table qui a perdu plus de 20 % de ses lignes", () => {
    const alertes = db.detecterPertesLignes({ projets: 70, clients: 100, factures: 3, heures: 500 }, { projets: 100, clients: 90, factures: 4, heures: 500 });
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatch(/^projets : 100 → 70/);
    expect(db.detecterPertesLignes({ projets: 81 }, { projets: 100 })).toHaveLength(0);
    expect(db.detecterPertesLignes({ projets: 0 }, null)).toHaveLength(0);
  });

  it("purgerJournaux : vieux journal, empreintes > 24 h et idempotence > 7 j en un lot", async () => {
    const c = db.db();
    const maintenant = Date.now();
    const iso = (ms: number) => new Date(maintenant - ms).toISOString();
    await c.batch([
      { sql: "INSERT INTO journal_activite (date, type, description) VALUES (?, 'projet.cree', 'vieux')", args: [iso(91 * 86400000)] },
      { sql: "INSERT INTO journal_activite (date, type, description) VALUES (?, 'projet.cree', 'recent')", args: [iso(1000)] },
      { sql: "INSERT INTO journal_activite (date, type, ref_type, ref_id, description) VALUES (?, 'requete.empreinte', 'lead-web', 'e1', 'vieille empreinte')", args: [iso(25 * 3600000)] },
      { sql: "INSERT INTO journal_activite (date, type, ref_type, ref_id, description) VALUES (?, 'requete.empreinte', 'lead-web', 'e2', 'empreinte fraiche')", args: [iso(3600000)] },
      { sql: "INSERT OR IGNORE INTO idempotence (cle, statut, corps, cree_le) VALUES ('/p|vieille', 200, '{}', ?)", args: [iso(8 * 86400000)] },
      { sql: "INSERT OR IGNORE INTO idempotence (cle, statut, corps, cree_le) VALUES ('/p|fraiche', 200, '{}', ?)", args: [iso(1000)] },
    ], "write");
    await db.purgerJournaux(maintenant);
    const descs = ((await c.execute("SELECT description FROM journal_activite WHERE description IN ('vieux','recent','vieille empreinte','empreinte fraiche')")).rows as any[]).map((r) => r.description).sort();
    expect(descs).toEqual(["empreinte fraiche", "recent"]);
    expect(await db.lireIdempotence("/p|vieille")).toBeNull();
    expect(await db.lireIdempotence("/p|fraiche")).not.toBeNull();
  });
});

describe("heures : contrôles de saisie et paie par quinzaine (DAS de la fiche, ventilation)", () => {
  it("controlesSaisieHeures : cumul du jour et doublon récent, l'entrée modifiée exclue", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Heures" });
    await db.ajouterEmploye({ nom: "Testeur Heures", taux_horaire: 40, das_pct: 0.2 } as any);
    const id1 = await db.ajouterHeureProjet({ projet_id: pid, date: "2026-09-14", heures: 8, employe: "Testeur Heures", taux_horaire: 40 });
    const c = await db.controlesSaisieHeures({ employe: "Testeur Heures", date: "2026-09-14", projet_id: pid, heures: 8 });
    expect(c.total_jour).toBe(8);
    expect(c.doublons_recents).toBe(1);
    const c2 = await db.controlesSaisieHeures({ employe: "Testeur Heures", date: "2026-09-14", projet_id: pid, heures: 8, exclureId: id1 });
    expect(c2.total_jour).toBe(0);
    expect(c2.doublons_recents).toBe(0);
    const c3 = await db.controlesSaisieHeures({ employe: "Testeur Heures", date: "2026-09-14", projet_id: pid, heures: 7.5 });
    expect(c3.doublons_recents).toBe(0); // même jour, autre nombre d'heures : pas un doublon
  });

  it("listerPaiePeriodes : DAS de la fiche (20 %), deux taux ventilés, surplus en banque, relecture sans changement", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Paie" });
    await db.ajouterEmploye({ nom: "Testeur Paie", taux_horaire: 40, das_pct: 0.2 } as any);
    // Quinzaine ancrée sur le lundi 2026-05-18 : 2026-09-07 (lundi) → 2026-09-20 (dimanche).
    // 50 h à 40 $ (7 au 11 sept.) + 40 h à 50 $ (14 au 17 sept.) = 90 h.
    for (const d of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]) {
      await db.ajouterHeureProjet({ projet_id: pid, date: d, heures: 10, employe: "Testeur Paie", taux_horaire: 40 });
    }
    for (const d of ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]) {
      await db.ajouterHeureProjet({ projet_id: pid, date: d, heures: 10, employe: "Testeur Paie", taux_horaire: 50 });
    }
    const periodes = await db.listerPaiePeriodes("Testeur Paie");
    const p = periodes.find((x) => x.debut === "2026-09-07")!;
    expect(p).toBeTruthy();
    expect(p.fin).toBe("2026-09-20");
    expect(p.heures_travaillees).toBe(90);
    expect(p.heures_normales).toBe(80);
    expect(Number((p as any).banque_solde)).toBe(10);
    // Taux moyen pondéré : (50×40 + 40×50) / 90 = 44,44… ; brut = 80 × 44,44 = 3 555,56
    expect(p.taux_horaire).toBeCloseTo(4000 / 90, 6);
    expect(p.montant_brut).toBeCloseTo(80 * 4000 / 90, 4);
    expect(p.das_pct).toBeCloseTo(0.2, 6);                 // fiche employé, pas 0,15 codé en dur
    expect(p.das_montant).toBeCloseTo(p.montant_brut * 0.2, 4);
    expect(p.gains_par_taux).toHaveLength(2);
    expect(p.gains_par_taux!.reduce((s, g) => s + g.montant, 0)).toBeCloseTo(p.montant_brut, 4);
    // Relecture : mêmes chiffres, même id (pas de doublon de période).
    const encore = await db.listerPaiePeriodes("Testeur Paie");
    const p2 = encore.find((x) => x.debut === "2026-09-07")!;
    expect(p2.id).toBe(p.id);
    expect(p2.montant_brut).toBe(p.montant_brut);
    // Paie versée → modifier une heure de la période est refusé (heureDansPaiePayee).
    expect((await db.marquerPayePeriode(p.id!, true, "2026-10-01")).ok).toBe(true);
    expect(await db.heureDansPaiePayee("Testeur Paie", "2026-09-16")).toBe(true);
    expect(await db.heureDansPaiePayee("Testeur Paie", "2026-09-28")).toBe(false);
  });
});

// Chasse du 2026-10-03 — gardes de la couche données (chaque test ouvre la base isolée
// du fichier ; les noms d'employés et de clients sont propres à chaque test).
describe("confirmation de facturation : projet complété seulement, effacée à la réouverture", () => {
  it("404 logique sur un projet inexistant, refus sur un chantier non complété, ok sur un complété", async () => {
    expect((await db.confirmerFacturationProjet(999999, "Francis", true)).ok).toBe(false);
    const pid = await db.ajouterProjet({ nom: "Projet à confirmer", statut: "actif" });
    const refus = await db.confirmerFacturationProjet(pid, "Francis", true);
    expect(refus.ok).toBe(false);
    if (!refus.ok) expect(refus.code).toBe("non_complete");
    await db.modifierProjet(pid, { statut: "complete", date_fin_reelle: "2026-09-30", facturee: 1 } as any);
    expect((await db.listerProjetsAFacturer()).map((p) => p.id)).toContain(pid);
    const okr = await db.confirmerFacturationProjet(pid, "Francis", true);
    expect(okr.ok).toBe(true);
    if (okr.ok) expect(okr.par).toBe("Francis");
    // Confirmé : il sort du rappel « à facturer » (le bouton du tableau de bord envoie
    // maintenant `facturation_confirmee: true`, plus `facturee: 1` qui ne changeait rien).
    expect((await db.listerProjetsAFacturer()).map((p) => p.id)).not.toContain(pid);
    // Réouverture (ce que fait PATCH /api/projets) : la confirmation tombe aussi.
    await db.modifierProjet(pid, { statut: "actif", facturee: 0, date_fin_reelle: null, facturation_confirmee_le: null, facturation_confirmee_par: null } as any);
    const p = await db.getProjet(pid);
    expect((p as any).facturation_confirmee_le).toBeNull();
    await db.modifierProjet(pid, { statut: "complete", date_fin_reelle: "2026-10-02", facturee: 1 } as any);
    expect((await db.listerProjetsAFacturer()).map((p) => p.id)).toContain(pid);
  });

  it("ajouterProjet écrit date_fin_reelle et facturee (projet créé directement complété)", async () => {
    const pid = await db.ajouterProjet({ nom: "Créé complété", statut: "complete", date_fin_reelle: "2026-09-29", facturee: 1 } as any);
    const p = await db.getProjet(pid);
    expect(p?.date_fin_reelle).toBe("2026-09-29");
    expect(Number((p as any).facturee)).toBe(1);
  });
});

describe("paie : fiche retrouvée malgré la casse, férié refusé à un employé désactivé", () => {
  // 4 semaines de 40 h avant l'Action de grâce 2026 (lundi 12 oct.), puis la semaine du 5
  // au 9 : la quinzaine 2026-10-05 → 2026-10-18 porte des heures ET le férié.
  const jours = (lundi: string, n = 5) => {
    const [y, m, d] = lundi.split("-").map(Number);
    return Array.from({ length: n }, (_, i) => {
      const dt = new Date(y, m - 1, d + i);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    });
  };
  const semaines = [...jours("2026-09-14"), ...jours("2026-09-21"), ...jours("2026-09-28"), ...jours("2026-10-05")];

  it("employé ACTIF saisi en minuscules dans les heures : la fiche est retrouvée, le férié est crédité", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Férié Casse" });
    await db.ajouterEmploye({ nom: "Ferie Actif", taux_horaire: 40 } as any);
    for (const d of semaines) await db.ajouterHeureProjet({ projet_id: pid, date: d, heures: 8, employe: "ferie actif", taux_horaire: 40 });
    const p = (await db.listerPaiePeriodes("ferie actif")).find((x) => x.debut === "2026-10-05")!;
    expect(p).toBeTruthy();
    expect(Number(p.heures_ferie)).toBe(8);
    expect(Number(p.heures_normales)).toBe(48); // 40 h punchées + 8 h de férié
  });

  it("employé DÉSACTIVÉ (fin d'emploi) : aucune indemnité, même sur une quinzaine avec des heures", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Férié Inactif" });
    const eid = await db.ajouterEmploye({ nom: "Ferie Inactif", taux_horaire: 40 } as any);
    await db.modifierEmploye(eid, { actif: 0 });
    for (const d of semaines) await db.ajouterHeureProjet({ projet_id: pid, date: d, heures: 8, employe: "ferie inactif", taux_horaire: 40 });
    const p = (await db.listerPaiePeriodes("ferie inactif")).find((x) => x.debut === "2026-10-05")!;
    expect(p).toBeTruthy();
    expect(Number(p.heures_ferie)).toBe(0);
    expect(Number(p.heures_normales)).toBe(40);
  });

  it("marquerPayePeriode : refuse une période déjà payée et ne réécrit pas la date", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Paie Idempotente" });
    await db.ajouterEmploye({ nom: "Paie Idem", taux_horaire: 30 } as any);
    await db.ajouterHeureProjet({ projet_id: pid, date: "2026-08-03", heures: 8, employe: "Paie Idem", taux_horaire: 30 });
    const p = (await db.listerPaiePeriodes("Paie Idem")).find((x) => x.debut === periodeBiHebdo("2026-08-03").debut)!;
    expect((await db.marquerPayePeriode(p.id!, true, "2026-08-20")).ok).toBe(true);
    const deux = await db.marquerPayePeriode(p.id!, true, "2026-09-30");
    expect(deux.ok).toBe(false);
    expect(deux.raison).toContain("déjà");
    const lue = (await db.listerPaiePeriodes("Paie Idem")).find((x) => x.id === p.id)!;
    expect(lue.date_paiement).toBe("2026-08-20");
    // Suppression d'une période VERSÉE refusée ; annulée, elle redevient supprimable.
    expect((await db.supprimerPayePeriode(p.id!)).ok).toBe(false);
    expect((await db.marquerPayePeriode(p.id!, false)).ok).toBe(true);
    expect((await db.supprimerPayePeriode(p.id!)).ok).toBe(true);
  });
});

describe("factures et extras : encaissement idempotent, suppressions verrouillées", () => {
  it("marquerFacturePayee : la 2e fois est refusée, la date d'encaissement reste", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Facture Idem" });
    const fid = await db.ajouterFactureProjet({ projet_id: pid, montant: 500, date: "2026-09-01" });
    expect((await db.marquerFacturePayee(fid, "2026-09-10")).ok).toBe(true);
    const deux = await db.marquerFacturePayee(fid, "2026-09-30");
    expect(deux.ok).toBe(false);
    expect(deux.raison).toContain("déjà");
    const f = (await db.listerFacturesProjet(pid)).find((x) => x.id === fid)!;
    expect(f.date_paiement).toBe("2026-09-10");
    expect(Number(f.montant_paye)).toBe(500);
    expect((await db.marquerFacturePayee(999999, "2026-09-10")).ok).toBe(false);
  });

  it("supprimerExtra : refusé tant que l'extra est marqué facturé, permis une fois rouvert", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Extra Facturé" });
    const xid = await db.ajouterExtra({ projet_id: pid, date: "2026-09-01", description: "Extra chargé", montant: 200 });
    await db.marquerExtraCharge(xid, true);
    const refus = await db.supprimerExtra(xid);
    expect(refus.ok).toBe(false);
    expect(refus.raison).toContain("FACTURÉ");
    expect((await db.listerExtras(undefined, pid)).map((e) => e.id)).toContain(xid);
    await db.marquerExtraCharge(xid, false);
    expect((await db.supprimerExtra(xid)).ok).toBe(true);
    expect((await db.supprimerExtra(xid)).ok).toBe(false); // introuvable
  });

  it("supprimerProjet refuse un projet avec une facture ENCAISSÉE ou des heures dans une paie VERSÉE", async () => {
    // Facture encaissée.
    const p1 = await db.ajouterProjet({ nom: "Projet Facture Encaissée" });
    const fid = await db.ajouterFactureProjet({ projet_id: p1, montant: 100, date: "2026-09-01" });
    await db.marquerFacturePayee(fid, "2026-09-05");
    const r1 = await db.supprimerProjet(p1);
    expect(r1.ok).toBe(false);
    expect(r1.raison).toContain("ENCAISSÉE");
    expect(await db.getProjet(p1)).not.toBeNull();
    await db.annulerPaiementFacture(fid);
    expect((await db.supprimerProjet(p1)).ok).toBe(true);
    // Heures dans une paie versée.
    const p2 = await db.ajouterProjet({ nom: "Projet Heures Payées" });
    await db.ajouterEmploye({ nom: "Suppr Paye", taux_horaire: 30 } as any);
    await db.ajouterHeureProjet({ projet_id: p2, date: "2026-07-06", heures: 8, employe: "Suppr Paye", taux_horaire: 30 });
    const per = (await db.listerPaiePeriodes("Suppr Paye")).find((x) => x.debut === periodeBiHebdo("2026-07-06").debut)!;
    await db.marquerPayePeriode(per.id!, true, "2026-07-20");
    const r2 = await db.supprimerProjet(p2);
    expect(r2.ok).toBe(false);
    expect(r2.raison).toContain("VERSÉE");
    expect((await db.listerHeuresProjet(p2)).length).toBe(1);
  });

  it("supprimer(soumission) refuse une soumission acceptée ; supprimerContrat refuse un contrat signé", async () => {
    const numero = await db.sauvegarder({ client: { nom: "Client Accepté" }, total: 100, data: {} });
    await db.changerStatut(numero, "acceptee");
    const r = await db.supprimer(numero);
    expect(r.ok).toBe(false);
    expect(await db.charger(numero)).not.toBeNull();
    expect((await db.supprimer("S-INEXISTANTE")).ok).toBe(false);
    const c = await db.ajouterContrat({ titre: "Contrat signé", date_emission: "2026-09-01" } as any);
    await db.modifierContrat(c.id, { signe_par_client: 1, date_signature: "2026-09-02" } as any);
    const rc = await db.supprimerContrat(c.id);
    expect(rc.ok).toBe(false);
    expect(rc.raison).toContain("SIGNÉ");
    expect(await db.getContrat(c.id)).toBeTruthy();
    const c2 = await db.ajouterContrat({ titre: "Brouillon", date_emission: "2026-09-01" } as any);
    expect((await db.supprimerContrat(c2.id)).ok).toBe(true);
  });
});

describe("clients : rattachement par courriel, téléphone, puis nom sans coordonnées", () => {
  it("courriel (sans casse) d'abord ; la fiche retrouvée reçoit le téléphone qui lui manquait, jamais écrasé", async () => {
    const a = await db.ajouterClient({ nom: "Julie Tremblay", courriel: "julie@exemple.ca" } as any);
    const r = await db.rattacherOuCreerClient("JULIE TREMBLAY", { courriel: "Julie@Exemple.CA", telephone: "514 555-0001" });
    expect(r.id).toBe(a);
    expect(r.cree).toBe(false);
    expect(r.nom).toBe("Julie Tremblay");
    const fiche = await db.getClient(a);
    expect(fiche?.telephone).toBe("514 555-0001");
    expect(fiche?.courriel).toBe("julie@exemple.ca"); // pas réécrit avec la casse du candidat
    // Même nom, AUTRE courriel : une autre personne — plus de rattachement par le nom seul.
    const r2 = await db.rattacherOuCreerClient("Julie Tremblay", { courriel: "julie.t@autre.ca" });
    expect(r2.cree).toBe(true);
    expect(r2.id).not.toBe(a);
  });

  it("téléphone : 10 derniers chiffres, quel que soit le format ; le courriel manquant est complété", async () => {
    const b = await db.ajouterClient({ nom: "Marc Côté", telephone: "(514) 555-1234" } as any);
    const r = await db.rattacherOuCreerClient("M. Côté", { telephone: "+1 514-555-1234", courriel: "marc@exemple.ca" });
    expect(r.id).toBe(b);
    expect((await db.getClient(b))?.courriel).toBe("marc@exemple.ca");
    expect((await db.getClient(b))?.nom).toBe("Marc Côté"); // le nom n'est jamais réécrit
  });

  it("nom seul : seulement si ni le candidat ni la fiche n'ont de coordonnées", async () => {
    const c = await db.ajouterClient({ nom: "Paul Roy" } as any);
    expect((await db.rattacherOuCreerClient("paul roy", {})).id).toBe(c);
    // Candidat AVEC courriel : pas de rattachement par le nom → nouvelle fiche.
    const r = await db.rattacherOuCreerClient("Paul Roy", { courriel: "paul@exemple.ca" });
    expect(r.cree).toBe(true);
    expect(r.id).not.toBe(c);
    // Fiche AVEC coordonnées, candidat sans : pas de rattachement non plus.
    const d = await db.ajouterClient({ nom: "Anne Lavoie", telephone: "438 555-9999" } as any);
    const r2 = await db.rattacherOuCreerClient("Anne Lavoie", {});
    expect(r2.id).not.toBe(d);
    // Rien du tout : aucune fiche.
    expect((await db.rattacherOuCreerClient("", {})).id).toBe(0);
    // trouverOuCreerClient reste l'enveloppe qui rend l'id.
    expect(await db.trouverOuCreerClient("paul roy")).toBe(c);
  });
});

describe("dépenses : fournisseur normalisé côté serveur", () => {
  it("normaliserFournisseur : espaces, graphie connue, majuscule initiale", () => {
    const connus = ["Patrick Morin", "BMR"];
    expect(db.normaliserFournisseur("  patrick   morin ", connus)).toBe("Patrick Morin");
    expect(db.normaliserFournisseur("bmr", connus)).toBe("BMR");
    expect(db.normaliserFournisseur("éco-centre", connus)).toBe("Éco-centre");
    expect(db.normaliserFournisseur("Shell", connus)).toBe("Shell");
    expect(db.normaliserFournisseur("   ", connus)).toBeNull();
    expect(db.normaliserFournisseur(null, connus)).toBeNull();
  });
  it("ajouterDepenseProjet et modifierDepenseProjet appliquent la normalisation", async () => {
    const pid = await db.ajouterProjet({ nom: "Projet Fournisseur" });
    const id1 = await db.ajouterDepenseProjet({ projet_id: pid, date: "2026-09-01", montant: 10, fournisseur: "canac" });
    const id2 = await db.ajouterDepenseProjet({ projet_id: pid, date: "2026-09-02", montant: 10, fournisseur: "  CANAC " });
    const liste = await db.listerDepensesProjet(pid);
    expect(liste.find((d) => d.id === id1)?.fournisseur).toBe("Canac");
    expect(liste.find((d) => d.id === id2)?.fournisseur).toBe("Canac"); // la graphie connue gagne
    await db.modifierDepenseProjet(id2, { fournisseur: "  patrick  morin" });
    expect((await db.listerDepensesProjet(pid)).find((d) => d.id === id2)?.fournisseur).toBe("Patrick morin");
  });
});

describe("contrats en ligne : numéro repris seulement d'un projet du client, jamais en double", () => {
  it("numeroContratPipelineExiste et projetDuClientParNumero", async () => {
    const cid = await db.ajouterClient({ nom: "Client Numéro" } as any);
    const autre = await db.ajouterClient({ nom: "Autre Client" } as any);
    await db.ajouterProjet({ nom: "Chantier numéroté", client_id: cid, numero: "2026-777" } as any);
    expect((await db.projetDuClientParNumero(cid, "2026-777"))?.numero).toBe("2026-777");
    expect(await db.projetDuClientParNumero(autre, "2026-777")).toBeNull();
    expect(await db.projetDuClientParNumero(cid, "2026-778")).toBeNull();
    expect(await db.numeroContratPipelineExiste("2026-777")).toBe(false);
    const coid = await db.creerContratPipeline({ client_id: cid, numero: "2026-777", token: "tok-num-777", data_json: {}, pdf_brouillon: "" });
    expect(await db.numeroContratPipelineExiste("2026-777")).toBe(true);
    expect(await db.numeroContratPipelineExiste(" 2026-777 ")).toBe(true);
    expect(await db.numeroContratPipelineExiste("2026-777", coid)).toBe(false);
  });
});
