// Mots de passe gérés DANS l'app (table `comptes`) — hachage scrypt, jetons de
// réinitialisation. Avant, les mots de passe ne vivaient que dans les variables Vercel :
// impossible d'en changer sans redéployer, aucun « mot de passe oublié ».
//
// Règles :
// - Le mot de passe de la variable d'environnement (FRANCIS_PASSWORD…) reste le mot de
//   passe d'AMORÇAGE : il sert tant qu'aucun mot de passe n'a été défini dans l'app.
//   Dès qu'un mot de passe est défini ici, c'est lui seul qui compte à la connexion.
// - Le hachage est scrypt (Node, aucune dépendance), sel aléatoire par mot de passe.
// - Le jeton de réinitialisation n'est jamais stocké en clair : seul son SHA-256 l'est.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export const MDP_LONGUEUR_MIN = 8;
export const JETON_REINIT_VALIDITE_MS = 2 * 60 * 60 * 1000; // 2 h

/** Message de refus si le mot de passe ne respecte pas la règle, sinon null. */
export function motDePasseInvalide(mdp: unknown): string | null {
  const s = typeof mdp === "string" ? mdp : "";
  if (s.length < MDP_LONGUEUR_MIN) return `Le mot de passe doit faire au moins ${MDP_LONGUEUR_MIN} caractères.`;
  if (s.length > 200) return "Le mot de passe est trop long (200 caractères max).";
  if (!/\S/.test(s)) return "Le mot de passe ne peut pas être vide.";
  return null;
}

/** « scrypt$<sel hex>$<hash hex> ». */
export function hacherMotDePasse(mdp: string): string {
  const sel = randomBytes(16);
  const hash = scryptSync(mdp, sel, 64);
  return `scrypt$${sel.toString("hex")}$${hash.toString("hex")}`;
}

/** Vrai si `mdp` correspond au hachage (comparaison à temps constant). Un hachage mal
 *  formé ne correspond jamais. */
export function verifierMotDePasse(mdp: string, hache: string | null | undefined): boolean {
  if (!hache || typeof mdp !== "string") return false;
  const [algo, selHex, hashHex] = String(hache).split("$");
  if (algo !== "scrypt" || !selHex || !hashHex) return false;
  try {
    const attendu = Buffer.from(hashHex, "hex");
    const sel = Buffer.from(selHex, "hex");
    // Un hachage corrompu (« zz » → tampon vide) donnait deux tampons vides ÉGAUX : vrai.
    if (attendu.length < 32 || sel.length < 8) return false;
    const obtenu = scryptSync(mdp, sel, attendu.length);
    return attendu.length === obtenu.length && timingSafeEqual(attendu, obtenu);
  } catch {
    return false;
  }
}

/** Jeton de réinitialisation (48 hex, 192 bits) et son empreinte stockable. */
export function genererJetonReinit(): string {
  return randomBytes(24).toString("hex");
}
export function empreinteJeton(jeton: string): string {
  return createHash("sha256").update(String(jeton || "")).digest("hex");
}
