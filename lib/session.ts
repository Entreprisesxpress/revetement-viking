// Session partagée — SOURCE UNIQUE de la logique d'authentification.
// Utilisée par le middleware (proxy.ts), les routes API (authUser.ts) et le login.
// Edge-safe : uniquement Web Crypto + TextEncoder + process.env (aucune API Node,
// aucun import DB) → utilisable dans le runtime edge du middleware.

export const UTILISATEURS = ["Gabriel", "Francis"] as const;
const LEGACY_PREFIX = "ok:";
const VERSION_V2 = "v2";

// Durée de vie d'une session (90 jours). Après, reconnexion requise.
export const DUREE_SESSION_MS = 90 * 24 * 60 * 60 * 1000;

const enProduction = () => process.env.NODE_ENV === "production";

/** Mot de passe d'un utilisateur : par-utilisateur d'abord, APP_PASSWORD en repli. */
export function motDePasse(user: string): string | undefined {
  if (user === "Gabriel") return process.env.GABRIEL_PASSWORD || process.env.APP_PASSWORD;
  if (user === "Francis") return process.env.FRANCIS_PASSWORD || process.env.APP_PASSWORD;
  return undefined;
}

/** Vrai dès qu'UN mot de passe est configuré (n'importe lequel des trois). */
export function authConfiguree(): boolean {
  return !!(process.env.APP_PASSWORD || process.env.FRANCIS_PASSWORD || process.env.GABRIEL_PASSWORD);
}

// Matériel de signature : lie la session au mot de passe de l'utilisateur ET, si présent,
// à SESSION_SECRET. Changer l'un OU l'autre révoque toutes les sessions (rotation).
function materielSignature(user: string): string | undefined {
  const pwd = motDePasse(user);
  if (!pwd) return undefined;
  return `${process.env.SESSION_SECRET || ""}::${pwd}`;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparaison à temps constant (anti timing-attack).
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Legacy v1 : "user|HMAC(pwd,'xpress-auth-v1')" — sans expiration.
const signV1 = (pwd: string) => hmacHex(pwd, "xpress-auth-v1");

/** Crée la valeur de cookie signée, format v2 avec expiration. Null si pas de mot de passe. */
export async function creerCookie(user: string): Promise<string | null> {
  const mat = materielSignature(user);
  if (!mat) return null;
  const exp = Date.now() + DUREE_SESSION_MS;
  const sig = await hmacHex(mat, `${VERSION_V2}:${user}:${exp}`);
  return `${VERSION_V2}|${user}|${exp}|${sig}`;
}

/** Valide un cookie et retourne l'utilisateur (ou null). Gère v2, v1 et legacy. */
export async function utilisateurDuCookie(cookieValue?: string): Promise<string | null> {
  if (!cookieValue) return null;

  // Format v2 : "v2|user|exp|sig"
  if (cookieValue.startsWith(VERSION_V2 + "|")) {
    const [, user, expStr, sig] = cookieValue.split("|");
    if (!user || !expStr || !sig) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return null; // expiré
    const mat = materielSignature(user);
    if (!mat) return enProduction() ? null : user || null; // pas de mdp : dev seulement
    return eq(sig, await hmacHex(mat, `${VERSION_V2}:${user}:${exp}`)) ? user : null;
  }

  // Dès que la rotation (SESSION_SECRET) est activée, on refuse tout ancien format
  // (v1/legacy sans expiration) — c'est ce qui rend la rotation réellement effective.
  if (process.env.SESSION_SECRET) return null;

  // Legacy v1 : "user|sig"
  if (cookieValue.includes("|")) {
    const [user, sig] = cookieValue.split("|");
    const pwd = motDePasse(user);
    if (!pwd) return enProduction() ? null : user || null; // dev local sans mdp
    return eq(sig, await signV1(pwd)) ? user : null;
  }

  // Legacy APP_PASSWORD seul → Gabriel
  const appPwd = process.env.APP_PASSWORD;
  if (!appPwd) return null;
  if (cookieValue === `${LEGACY_PREFIX}${appPwd}`) return "Gabriel";
  return eq(cookieValue, await signV1(appPwd)) ? "Gabriel" : null;
}
