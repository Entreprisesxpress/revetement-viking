// Jours fériés du Québec + vacances de la construction (CCQ).
// Utilisé par l'échéancier des projets pour griser les périodes non travaillées.

export interface Ferie { date: string; nom: string; }
export interface PeriodeVacances { debut: string; fin: string; nom: string; }

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// nième occurrence d'un jour de semaine dans un mois (jourSemaine: 0=dim..6=sam).
function niemeJour(annee: number, mois1: number, jourSemaine: number, n: number): string {
  const premier = new Date(annee, mois1 - 1, 1);
  const decalage = (jourSemaine - premier.getDay() + 7) % 7;
  return ymd(annee, mois1, 1 + decalage + (n - 1) * 7);
}
// Lundi tombant le ou avant une date donnée (ex: patriotes = lundi avant le 25 mai).
function lundiAvant(annee: number, mois1: number, jourMax: number): string {
  const d = new Date(annee, mois1 - 1, jourMax);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
// Dimanche de Pâques (algorithme anonyme grégorien).
function paques(annee: number): Date {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}
function plusJours(d: Date, n: number): string {
  const x = new Date(d); x.setDate(d.getDate() + n);
  return ymd(x.getFullYear(), x.getMonth() + 1, x.getDate());
}

/** Jours fériés payés au Québec (incluant les congés CCQ de la construction). */
export function joursFeriesQC(annee: number): Ferie[] {
  const p = paques(annee);
  return [
    { date: ymd(annee, 1, 1), nom: "Jour de l'An" },
    { date: ymd(annee, 1, 2), nom: "Lendemain du Jour de l'An" },
    { date: plusJours(p, -2), nom: "Vendredi saint" },
    { date: plusJours(p, 1), nom: "Lundi de Pâques" },
    { date: lundiAvant(annee, 5, 25), nom: "Journée des patriotes" },
    { date: ymd(annee, 6, 24), nom: "Fête nationale" },
    { date: ymd(annee, 7, 1), nom: "Fête du Canada" },
    { date: niemeJour(annee, 9, 1, 1), nom: "Fête du Travail" },
    { date: niemeJour(annee, 10, 1, 2), nom: "Action de grâce" },
    { date: ymd(annee, 12, 25), nom: "Noël" },
    { date: ymd(annee, 12, 26), nom: "Lendemain de Noël" },
  ];
}

// Dates officielles CCQ (publiées chaque année). Au-delà : heuristique.
const VAC_ETE: Record<number, [string, string]> = {
  2024: ["2024-07-21", "2024-08-03"],
  2025: ["2025-07-20", "2025-08-02"],
  2026: ["2026-07-19", "2026-08-01"],
  2027: ["2027-07-18", "2027-07-31"],
  2028: ["2028-07-23", "2028-08-05"],
};
const VAC_HIVER: Record<number, [string, string]> = {
  2024: ["2024-12-22", "2025-01-04"],
  2025: ["2025-12-21", "2026-01-03"],
  2026: ["2026-12-20", "2027-01-02"],
  2027: ["2027-12-19", "2028-01-01"],
};

// Fallback : 2 semaines (dim→sam) se terminant le 1er samedi d'août.
function vacEteHeuristique(annee: number): [string, string] {
  const d = new Date(annee, 7, 1); // 1er août
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); // 1er samedi d'août
  const fin = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  d.setDate(d.getDate() - 13); // recule de 2 semaines (début dimanche)
  const debut = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return [debut, fin];
}

/** Périodes de vacances de la construction touchant l'année (été + Fêtes, incl. report de déc. précédent). */
export function vacancesConstruction(annee: number): PeriodeVacances[] {
  const out: PeriodeVacances[] = [];
  const ete = VAC_ETE[annee] || vacEteHeuristique(annee);
  out.push({ debut: ete[0], fin: ete[1], nom: "Vacances de la construction (été)" });
  if (VAC_HIVER[annee]) out.push({ debut: VAC_HIVER[annee][0], fin: VAC_HIVER[annee][1], nom: "Congé des Fêtes (construction)" });
  // Le congé des Fêtes de l'année précédente déborde en janvier.
  if (VAC_HIVER[annee - 1]) out.push({ debut: VAC_HIVER[annee - 1][0], fin: VAC_HIVER[annee - 1][1], nom: "Congé des Fêtes (construction)" });
  return out;
}

/** Construit des accès rapides (férié + vacances) pour un ensemble d'années. */
export function infoCalendrierQC(annees: number[]) {
  const feries = new Map<string, string>();
  const vacances: PeriodeVacances[] = [];
  for (const a of annees) {
    for (const f of joursFeriesQC(a)) feries.set(f.date, f.nom);
    for (const v of vacancesConstruction(a)) vacances.push(v);
  }
  const ferieDe = (jour: string) => feries.get(jour);
  const vacancesDe = (jour: string) => vacances.find((v) => jour >= v.debut && jour <= v.fin)?.nom;
  return { ferieDe, vacancesDe };
}
