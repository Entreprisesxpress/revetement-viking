// Détail d'une quinzaine de paie, jour par jour et semaine par semaine — logique PURE.
//
// Pourquoi : la paie ne montrait qu'un total (« 80 h payées ») et le talon faisait de même.
// Un employé qui a travaillé 91,5 h voyait « 80 h » et concluait qu'il manquait des heures,
// alors que le surplus était à la banque ; et si une journée manquait VRAIMENT (oubli de
// saisie), rien ne permettait de la repérer. Ici on reconstruit le calendrier complet de la
// quinzaine : chaque jour, même à 0 h, pour qu'un trou saute aux yeux.
//
// Ce module ne connaît ni la base ni les montants : il reçoit les entrées d'heures telles que
// /api/heures les rend, et renvoie des semaines → jours → entrées.

import { dateISOLocale } from "./calculs";

export interface EntreeHeureDetail {
  date: string;
  heures: number;
  projet_nom?: string | null;
  description?: string | null;
  taux_horaire?: number | null;
}

export interface JourDetail {
  /** AAAA-MM-JJ */
  date: string;
  /** Total des heures du jour (somme des entrées). */
  total: number;
  entrees: EntreeHeureDetail[];
}

export interface SemaineDetail {
  /** 1 ou 2 dans une quinzaine. */
  numero: number;
  debut: string;
  fin: string;
  total: number;
  /** Les 7 jours, dans l'ordre, y compris ceux sans heure. */
  jours: JourDetail[];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function plusJours(iso: string, n: number): string {
  const d = dateISOLocale(iso);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Arrondi au centième : 7,5 + 0,25 + … ne doit pas donner 7,750000001 à l'écran. */
const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Découpe [debut, fin] (bornes incluses) en semaines de 7 jours et y range les entrées.
 * Les entrées hors période sont ignorées ; une date avec heure (« 2026-06-01T… ») est
 * ramenée au jour. Une période qui n'est pas un multiple de 7 jours garde une dernière
 * semaine plus courte — jamais de jour inventé au-delà de `fin`.
 */
export function semainesDeLaPeriode(debut: string, fin: string, entrees: EntreeHeureDetail[]): SemaineDetail[] {
  if (!debut || !fin || fin < debut) return [];
  const parJour = new Map<string, EntreeHeureDetail[]>();
  for (const e of entrees || []) {
    const jour = String(e.date || "").slice(0, 10);
    if (!jour || jour < debut || jour > fin) continue;
    if (!parJour.has(jour)) parJour.set(jour, []);
    parJour.get(jour)!.push(e);
  }
  const semaines: SemaineDetail[] = [];
  let curseur = debut;
  let numero = 1;
  while (curseur <= fin) {
    const finSemaine = plusJours(curseur, 6) <= fin ? plusJours(curseur, 6) : fin;
    const jours: JourDetail[] = [];
    for (let j = curseur; j <= finSemaine; j = plusJours(j, 1)) {
      const liste = parJour.get(j) || [];
      jours.push({ date: j, total: arrondi(liste.reduce((s, e) => s + (Number(e.heures) || 0), 0)), entrees: liste });
    }
    semaines.push({
      numero,
      debut: curseur,
      fin: finSemaine,
      total: arrondi(jours.reduce((s, x) => s + x.total, 0)),
      jours,
    });
    curseur = plusJours(finSemaine, 1);
    numero++;
  }
  return semaines;
}

/** Total des heures de toutes les semaines (= heures travaillées de la période). */
export function totalSemaines(semaines: SemaineDetail[]): number {
  return arrondi(semaines.reduce((s, x) => s + x.total, 0));
}

/** « lun. 18 mai » — court, pour une ligne de tableau. */
export function jourCourt(iso: string): string {
  return dateISOLocale(iso).toLocaleDateString("fr-CA", { weekday: "short", day: "numeric", month: "short" });
}

/** « 7,50 h » — virgule décimale : ce texte est remis à l'employé. */
export function heuresLisibles(h: number): string {
  return `${new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(h || 0)} h`;
}

/**
 * Ce qu'il est advenu des heures de la quinzaine, en une phrase par ligne. C'est la réponse
 * à « il me manque des heures » : travaillées, férié, payées, et le reste — reportées en
 * banque ou tirées de la banque — sans que rien ne s'évapore.
 */
export function bilanHeures(p: {
  heures_travaillees: number;
  heures_ferie?: number;
  heures_normales: number;
  banque_appliquee?: number;
  banque_solde?: number;
}): { libelle: string; heures: number }[] {
  const travaillees = Number(p.heures_travaillees) || 0;
  const ferie = Number(p.heures_ferie) || 0;
  const payees = Number(p.heures_normales) || 0;
  const tirees = Number(p.banque_appliquee) || 0;
  // Reportées = ce qui a été crédité (travaillé + férié) mais pas payé, hors banque tirée.
  const reportees = arrondi(Math.max(0, travaillees + ferie + tirees - payees));
  const lignes: { libelle: string; heures: number }[] = [{ libelle: "Heures travaillées", heures: arrondi(travaillees) }];
  if (ferie > 0) lignes.push({ libelle: "Indemnité de jour férié", heures: arrondi(ferie) });
  if (tirees > 0) lignes.push({ libelle: "Tirées de la banque d'heures", heures: arrondi(tirees) });
  lignes.push({ libelle: "Heures payées", heures: arrondi(payees) });
  if (reportees > 0) lignes.push({ libelle: "Reportées en banque d'heures (payables plus tard)", heures: reportees });
  if (p.banque_solde != null) lignes.push({ libelle: "Banque d'heures après cette paie (solde)", heures: arrondi(Number(p.banque_solde) || 0) });
  return lignes;
}
