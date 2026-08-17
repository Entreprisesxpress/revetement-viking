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

/** Délai de grâce après la fin d'un chantier, pour la saisie tardive. */
export const JOURS_GRACE_SAISIE = 14;

/**
 * Un chantier accepte-t-il encore une saisie (dépense, heures) ?
 *
 * Annulé : jamais. En activité, à venir, en pause : toujours. Complété : encore
 * deux semaines après la fin — les factures de fournisseurs arrivent en retard et
 * les retouches de garantie se pointent après la fermeture du chantier. Passé ce
 * délai, le chantier sort des menus pour ne pas fausser le coût de revient d'un
 * dossier déjà facturé ; la fiche du projet reste la porte de sortie.
 *
 * Sans date de fin (vieux projets importés), on n'a aucun moyen de juger de l'âge :
 * le chantier sort des menus. La complétion pose `date_fin_reelle` d'office depuis
 * /api/projets, donc le cas ne touche plus les chantiers d'aujourd'hui.
 */
export function accepteSaisieTardive(
  projet: { statut?: string | null; date_fin_reelle?: string | null; date_fin_prevue?: string | null },
  maintenant: number = Date.now(),
): boolean {
  if (projet.statut === "annule") return false;
  if (projet.statut !== "complete") return true;
  const fin = projet.date_fin_reelle || projet.date_fin_prevue;
  if (!fin) return false;
  const t = new Date(fin).getTime();
  if (Number.isNaN(t)) return false;
  return maintenant - t <= JOURS_GRACE_SAISIE * 86400000;
}
