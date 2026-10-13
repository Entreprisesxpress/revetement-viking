// Déconnexion : ne jette jamais une saisie faite hors ligne sans l'avoir dit.
//
// Se déconnecter purge l'appareil (cache, brouillons, FILE HORS-LIGNE). Avant, des heures
// ou des dépenses saisies sur un toit et pas encore parties étaient effacées en silence
// par le « Te déconnecter ? » : on tente d'abord de les envoyer, puis on prévient.
import { nbActionsEnAttente, viderFile } from "@/lib/fileOffline";

/** Vrai si l'usager confirme la déconnexion en connaissance de cause. */
export async function confirmerDeconnexion(question = "Te déconnecter ?"): Promise<boolean> {
  let enAttente = 0;
  try { enAttente = nbActionsEnAttente(); } catch { enAttente = 0; }
  if (enAttente > 0) {
    try {
      const bilan = await viderFile();
      enAttente = bilan.restantes;
    } catch { /* réseau absent : la file reste telle quelle */ }
  }
  if (enAttente > 0) {
    return confirm(`⚠️ ${enAttente} saisie(s) faite(s) hors ligne n'ont PAS encore été envoyées (réseau ?). Se déconnecter maintenant les EFFACERA définitivement.\n\nTe déconnecter quand même ?`);
  }
  return confirm(question);
}
