// Statuts de projet — source unique.
//
// Deux statuts désignent un chantier EN ACTIVITÉ : « actif » (posé à la création d'un
// projet) et « en_cours » (posé par le bouton « Commencer ce chantier »). Les écrans ne
// s'accordaient pas : seule la liste des projets voyait les deux, si bien que démarrer un
// chantier le faisait DISPARAÎTRE du tableau de bord, du sélecteur de projet (saisie
// d'heures, dépenses, photos), des alertes de retard et de la météo de chantier.
// Tout le monde passe maintenant par ces helpers.

export const STATUTS_PROJET = ["actif", "a_venir", "en_cours", "en_pause", "complete", "annule"] as const;
export type StatutProjet = (typeof STATUTS_PROJET)[number];

/** Les statuts qui veulent dire « le chantier roule ». */
export const STATUTS_ACTIFS: readonly string[] = ["actif", "en_cours"];

export function estProjetActif(statut?: string | null): boolean {
  return STATUTS_ACTIFS.includes(String(statut || ""));
}

/** Fragment SQL équivalent, pour les requêtes qui filtrent en base.
 *  Valeurs en dur volontairement : aucune donnée utilisateur n'entre ici. */
export const SQL_PROJET_ACTIF = "statut IN ('actif', 'en_cours')";
