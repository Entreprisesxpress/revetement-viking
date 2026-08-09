// Vocabulaire fermé de l'app : statuts et étapes autorisés.
//
// Pourquoi : mesuré en direct, le serveur acceptait n'importe quelle chaîne. Un statut
// de client « licorne », une étape de pipeline « etape_inexistante », un statut de
// soumission « statut_bidon » étaient tous enregistrés en 200. Conséquence : la fiche
// n'apparaît plus dans AUCUN filtre ni dans AUCUNE colonne du kanban — elle existe en
// base mais devient introuvable à l'écran. Un dossier perdu, sans message d'erreur.
//
// Module NU (aucun import de base de données, aucun JSX) : utilisable des deux côtés.

export const STATUTS_SOUMISSION = ["brouillon", "envoyee", "acceptee", "refusee", "facturee"] as const;
export type StatutSoumission = (typeof STATUTS_SOUMISSION)[number];

export const STATUTS_CLIENT = ["prospect", "actif", "inactif", "perdu"] as const;
export type StatutClient = (typeof STATUTS_CLIENT)[number];

/** Colonnes du kanban CRM. Source unique — components/PipelineCRM.tsx s'en sert pour
 *  l'affichage, et l'API pour valider. */
export const ETAPES_PIPELINE = [
  { key: "info_1", label: "Info 1ère soumission", couleur: "bg-slate-100 border-slate-300", emoji: "📋" },
  { key: "rdv", label: "Rendez-vous à céduler", couleur: "bg-sky-100 border-sky-300", emoji: "📅" },
  { key: "mesures", label: "Mesures et prise de photo", couleur: "bg-amber-100 border-amber-300", emoji: "📐" },
  { key: "soum_envoyer", label: "Soumission à envoyer", couleur: "bg-orange-100 border-orange-300", emoji: "✉️" },
  { key: "attente", label: "Projet en attente", couleur: "bg-violet-100 border-violet-300", emoji: "⏳" },
  { key: "accepte", label: "Projet accepté", couleur: "bg-emerald-100 border-emerald-300", emoji: "✅" },
] as const;

export const CLES_ETAPES_PIPELINE = ETAPES_PIPELINE.map((e) => e.key) as readonly string[];

export function estStatutSoumission(v: any): v is StatutSoumission {
  return typeof v === "string" && (STATUTS_SOUMISSION as readonly string[]).includes(v);
}
export function estStatutClient(v: any): v is StatutClient {
  return typeof v === "string" && (STATUTS_CLIENT as readonly string[]).includes(v);
}
/** Vide/absent = « aucune étape », c'est permis (le kanban a une colonne pour ça). */
export function estEtapePipeline(v: any): boolean {
  if (v === null || v === undefined || v === "") return true;
  return typeof v === "string" && CLES_ETAPES_PIPELINE.includes(v);
}

// Validation de courriel : volontairement permissive (un@domaine.tld sans espace).
// Le but n'est pas de valider la RFC 5322, c'est d'attraper « pas-un-courriel » et
// « marie@ » — des adresses vers lesquelles toute relance partait dans le vide, sans
// que rien ne le signale ni côté app ni côté client.
const RX_COURRIEL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export function courrielValide(v: any): boolean {
  if (v === null || v === undefined || v === "") return true; // champ optionnel
  return typeof v === "string" && v.length <= 254 && RX_COURRIEL.test(v.trim());
}
