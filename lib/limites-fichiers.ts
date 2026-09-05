/**
 * Limite de taille des fichiers envoyés en JSON (base64) — SOURCE UNIQUE.
 *
 * L'app tourne sur Vercel, où une fonction refuse tout corps de requête au-delà de
 * 4,5 Mo (réponse 413 en HTML, avant même que notre code s'exécute). Un fichier encodé
 * en base64 pèse 4/3 de sa taille brute, plus l'enveloppe JSON. Le plafond réel côté
 * fichier est donc ~3,2 Mo — et non « 4 Mo » ou « 5 Mo » comme neuf écrans le
 * disaient : entre 3,2 et 5 Mo, le fichier passait la vérification de l'écran, puis
 * l'envoi échouait avec « erreur 413 » (ou rien du tout).
 *
 * Les photos ne sont pas concernées : elles sont compressées à ~250 Ko avant l'envoi
 * (lib/compress.ts). Ceci vise les PDF, spécimens, contrats, devis — tout ce qui part brut.
 * Les vidéos passent par Google Drive directement, sans cette limite.
 */

/** Taille brute maximale d'un fichier envoyé tel quel (3 Mo → ~4,1 Mo encodé). */
export const LIMITE_FICHIER_OCTETS = 3 * 1024 * 1024;

/** Ce que le serveur accepte sur la CHAÎNE encodée (data URL). Sous les 4,5 Mo de Vercel,
 *  pour que ce soit notre message qui sorte, pas le 413 de la plateforme. */
export const LIMITE_ENCODEE_OCTETS = 4.2 * 1024 * 1024;

export const LIMITE_FICHIER_TEXTE = "3 Mo";

export function poidsLisible(octets: number): string {
  if (!(octets > 0)) return "0 Ko";
  return octets >= 1024 * 1024 ? `${(octets / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/**
 * Message d'erreur si le fichier est trop lourd pour partir tel quel, sinon null.
 * À appeler AVANT de lire le fichier — jamais après l'envoi.
 */
export function fichierTropLourd(f: { size: number; name?: string }): string | null {
  if (f.size <= LIMITE_FICHIER_OCTETS) return null;
  const nom = f.name ? `${f.name} ` : "";
  return `${nom}(${poidsLisible(f.size)}) dépasse ${LIMITE_FICHIER_TEXTE} — compresse le PDF ou réduis la photo`;
}

/** Côté serveur : la data URL reçue est-elle trop longue pour la plateforme ? */
export function donneesTropLourdes(data: unknown): boolean {
  return typeof data === "string" && data.length > LIMITE_ENCODEE_OCTETS;
}
