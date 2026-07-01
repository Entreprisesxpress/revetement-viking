// Jarvis — outils de données (lecture seule) que Claude peut appeler pour répondre
// aux questions de Francis à partir de ses vraies données.
import {
  db, finances, listerProjets, statistiques, listerClients,
  listerTaches, listerExtras, listerToutesDepenses,
} from "@/lib/db";

// === DÉFINITIONS D'OUTILS (format Anthropic tool-use) ===
export const OUTILS_JARVIS = [
  {
    name: "apercu_entreprise",
    description: "Vue d'ensemble rapide : nombre de projets par statut, CA et dépenses de l'année, marge, factures impayées, tâches ouvertes, extras à facturer. À appeler en premier pour une question générale.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "finances_mensuelles",
    description: "Détail financier mois par mois pour une année : revenus (avant taxes), dépenses (avant taxes), main-d'œuvre, marge nette.",
    input_schema: { type: "object", properties: { annee: { type: "number", description: "Année, ex: 2026" } }, required: ["annee"], additionalProperties: false },
  },
  {
    name: "projets",
    description: "Liste des projets avec leurs chiffres : prix contrat, extras facturés, dépenses, main-d'œuvre, coût total, marge $ et %. Filtrable par statut.",
    input_schema: { type: "object", properties: { statut: { type: "string", enum: ["actif", "a_venir", "complete", "annule"], description: "Filtre optionnel" } }, additionalProperties: false },
  },
  {
    name: "depenses",
    description: "Dépenses filtrées par période, fournisseur ou catégorie. Retourne les lignes (max 100 récentes) + total.",
    input_schema: { type: "object", properties: {
      depuis: { type: "string", description: "Date début AAAA-MM-JJ" },
      jusqu: { type: "string", description: "Date fin AAAA-MM-JJ" },
      fournisseur: { type: "string" },
      categorie: { type: "string" },
    }, additionalProperties: false },
  },
  {
    name: "heures",
    description: "Heures travaillées agrégées par employé (et coût) sur une période, optionnellement pour un projet.",
    input_schema: { type: "object", properties: {
      depuis: { type: "string", description: "AAAA-MM-JJ" },
      jusqu: { type: "string", description: "AAAA-MM-JJ" },
      projet_id: { type: "number" },
    }, additionalProperties: false },
  },
  {
    name: "taches",
    description: "Tâches à faire / complétées, filtrables par statut et personne assignée (Francis ou Gabriel).",
    input_schema: { type: "object", properties: {
      statut: { type: "string", enum: ["a_faire", "complete"] },
      assigne_a: { type: "string", enum: ["Francis", "Gabriel"] },
    }, additionalProperties: false },
  },
  {
    name: "clients",
    description: "Liste des clients (nom, coordonnées, statut, nb de projets). Recherche optionnelle par nom.",
    input_schema: { type: "object", properties: { recherche: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "soumissions_stats",
    description: "Statistiques des soumissions : nombre et montants par statut, pipeline, taux de conversion.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "extras",
    description: "Extras (travaux/matériaux hors soumission) à facturer ou déjà facturés.",
    input_schema: { type: "object", properties: { statut: { type: "string", enum: ["a_charger", "charge"] } }, additionalProperties: false },
  },
];

const num = (v: any) => Math.round((+v || 0) * 100) / 100;

// === EXÉCUTEURS ===
export async function executerOutilJarvis(nom: string, input: any): Promise<any> {
  try {
    switch (nom) {
      case "apercu_entreprise": {
        const annee = new Date().getFullYear();
        const [projets, fin, extrasAC] = await Promise.all([
          listerProjets(), finances(annee), listerExtras("a_charger"),
        ]);
        const parStatut: Record<string, number> = {};
        for (const p of projets) parStatut[p.statut || "?"] = (parStatut[p.statut || "?"] || 0) + 1;
        const ca = fin.mois.reduce((s: number, m: any) => s + (m.revenu_avant_taxes || 0), 0);
        const dep = fin.mois.reduce((s: number, m: any) => s + (m.depenses_avant_taxes || 0), 0);
        const mo = fin.mois.reduce((s: number, m: any) => s + (m.mo || 0), 0);
        const marge = fin.mois.reduce((s: number, m: any) => s + (m.marge || 0), 0);
        const actifs = projets.filter((p) => p.statut === "actif");
        const totMargeAct = actifs.reduce((s, p) => s + (p.marge || 0), 0);
        const totRevAct = actifs.reduce((s, p) => s + (p.revenu_avant_taxes || 0), 0);
        const factImp = await db().execute({ sql: "SELECT COALESCE(SUM(montant),0) t, COUNT(*) n FROM factures_projet WHERE payee=0 OR payee IS NULL", args: [] }).catch(() => ({ rows: [{ t: 0, n: 0 }] }));
        const nbTaches = await db().execute({ sql: "SELECT COUNT(*) n FROM taches_client WHERE statut != 'complete'", args: [] }).catch(() => ({ rows: [{ n: 0 }] }));
        return {
          annee, projets_total: projets.length, projets_par_statut: parStatut,
          ca_annee_avant_taxes: num(ca), depenses_annee_avant_taxes: num(dep), main_oeuvre_annee: num(mo),
          marge_nette_annee_avant_taxes: num(marge),
          marge_moyenne_projets_actifs_pct: totRevAct > 0 ? num((totMargeAct / totRevAct) * 100) : 0,
          factures_impayees: { nombre: +(factImp.rows[0] as any).n, montant: num((factImp.rows[0] as any).t) },
          taches_a_faire: +(nbTaches.rows[0] as any).n,
          extras_a_facturer: { nombre: extrasAC.length, montant: num(extrasAC.reduce((s: number, e: any) => s + (e.montant || 0), 0)) },
        };
      }
      case "finances_mensuelles": {
        const fin = await finances(+input.annee || new Date().getFullYear());
        return { annee: fin.annee, mois: fin.mois.map((m: any) => ({
          mois: m.mois, revenu_avant_taxes: num(m.revenu_avant_taxes), depenses_avant_taxes: num(m.depenses_avant_taxes),
          main_oeuvre: num(m.mo), marge_nette: num(m.marge), encaisse: num(m.paye),
        })) };
      }
      case "projets": {
        const p = await listerProjets(input.statut || undefined);
        return { nombre: p.length, projets: p.slice(0, 60).map((x) => ({
          nom: x.nom, client: x.client_nom || null, statut: x.statut,
          prix_contrat: num(x.prix_contrat || x.budget_estime || 0), extras_factures: num((x as any).extras_factures || 0),
          depenses: num(x.total_depenses), main_oeuvre: num(x.cout_main_oeuvre), cout_total: num(x.cout_total),
          marge: num(x.marge), marge_pct: num(x.marge_pct),
          facture: num(x.total_facture), paye: num(x.total_paye), date_fin_prevue: x.date_fin_prevue || null,
        })) };
      }
      case "depenses": {
        let arr = await listerToutesDepenses({ sansData: true });
        if (input.depuis) arr = arr.filter((d: any) => d.date >= input.depuis);
        if (input.jusqu) arr = arr.filter((d: any) => d.date <= input.jusqu);
        if (input.fournisseur) arr = arr.filter((d: any) => (d.fournisseur || "").toLowerCase().includes(String(input.fournisseur).toLowerCase()));
        if (input.categorie) arr = arr.filter((d: any) => (d.categorie || "").toLowerCase().includes(String(input.categorie).toLowerCase()));
        const total = arr.reduce((s: number, d: any) => s + (d.montant || 0), 0);
        return { nombre: arr.length, total: num(total), lignes: arr.slice(0, 100).map((d: any) => ({
          date: d.date, fournisseur: d.fournisseur, categorie: d.categorie, montant: num(d.montant), detaxe: !!d.detaxe, description: d.description || null,
        })) };
      }
      case "heures": {
        const conds: string[] = []; const args: any[] = [];
        if (input.depuis) { conds.push("date >= ?"); args.push(input.depuis); }
        if (input.jusqu) { conds.push("date <= ?"); args.push(input.jusqu); }
        if (input.projet_id) { conds.push("projet_id = ?"); args.push(+input.projet_id); }
        const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
        const r = await db().execute({ sql: `SELECT COALESCE(employe,'?') employe, COALESCE(SUM(heures),0) h, COALESCE(SUM(heures*taux_horaire),0) cout FROM heures_projet ${where} GROUP BY employe ORDER BY h DESC`, args });
        const rows = (r.rows as any[]).map((x) => ({ employe: x.employe, heures: num(x.h), cout: num(x.cout) }));
        return { par_employe: rows, total_heures: num(rows.reduce((s, x) => s + x.heures, 0)), total_cout: num(rows.reduce((s, x) => s + x.cout, 0)) };
      }
      case "taches": {
        const t = await listerTaches({ statut: input.statut || undefined, assigne_a: input.assigne_a || undefined });
        const auj = new Date().toISOString().slice(0, 10);
        return { nombre: t.length, taches: t.slice(0, 80).map((x: any) => ({
          titre: x.titre, statut: x.statut, assigne_a: x.assigne_a || null, echeance: x.date_due || null,
          en_retard: !!(x.date_due && x.date_due < auj && x.statut !== "complete"),
          recurrence: x.recurrence || null, client: x.client_nom || null, projet: x.projet_nom || null,
        })) };
      }
      case "clients": {
        let c = await listerClients();
        if (input.recherche) { const q = String(input.recherche).toLowerCase(); c = c.filter((x: any) => (x.nom || "").toLowerCase().includes(q)); }
        return { nombre: c.length, clients: c.slice(0, 80).map((x: any) => ({
          nom: x.nom, statut: x.statut || null, telephone: x.telephone || null, courriel: x.courriel || null, ville: x.adresse || null,
        })) };
      }
      case "soumissions_stats":
        return await statistiques();
      case "extras": {
        const e = await listerExtras(input.statut || undefined);
        return { nombre: e.length, total: num(e.reduce((s: number, x: any) => s + (x.montant || 0), 0)), extras: e.slice(0, 60).map((x: any) => ({
          projet: x.projet_nom || null, nature: x.nature, description: x.description, montant: num(x.montant), heures: x.heures || null, statut: x.statut, date: x.date,
        })) };
      }
      default:
        return { erreur: `Outil inconnu : ${nom}` };
    }
  } catch (e: any) {
    return { erreur: e?.message || "erreur d'exécution de l'outil" };
  }
}
