// Helpers communs aux routes API : lecture d'un identifiant, d'un corps JSON, d'une
// chaîne bornée, d'un booléen 0/1.
//
// Pourquoi : mesuré en direct, `DELETE /api/depenses?id=abc` répondait 500 (NaN poussé
// dans le SQL), `PATCH /api/cameras {id:"1.5"}` répondait `{ok:true}` sans rien écrire,
// et `POST /api/clients` avec un corps vide répondait 500 (req.json() lève). Une entrée
// illisible est une requête invalide (400), jamais une panne serveur (500) ni un faux
// succès. Import relatif : le harnais de tests résout mal l'alias « @/lib/… ».

/** Identifiant entier strictement positif, ou null si la valeur ne l'est pas.
 *  « abc », "", "1.5", "-1", "1e3", 0, NaN → null ; 7 et "7" → 7. */
export function idEntier(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d{1,15}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** Corps JSON d'une requête : l'objet lu, ou null si le corps est absent, illisible ou
 *  n'est pas un objet (la route répond alors 400 « corps JSON attendu »). */
export async function lireCorps(req: { json(): Promise<any> }): Promise<any | null> {
  const b = await req.json().catch(() => null);
  return b !== null && typeof b === "object" ? b : null;
}

/** Chaîne nettoyée (String, trim) et bornée à `max` caractères. `undefined` et `null`
 *  passent tels quels : dans un PATCH, « absent » veut dire « inchangé » et `null`
 *  veut dire « effacé ». */
export function texte(v: undefined, max: number): undefined;
export function texte(v: null, max: number): null;
export function texte(v: unknown, max: number): string | null | undefined;
export function texte(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return String(v).trim().slice(0, max);
}

/** Booléen coercé en 0/1 : true, 1, "1", "true" → 1 ; tout le reste → 0. */
export function bool01(v: unknown): 0 | 1 {
  return v === true || v === 1 || v === "1" || v === "true" ? 1 : 0;
}

/** Entier borné [min, max] (LIMIT, nombre de jours…), ou `defaut` si illisible. */
export function entierBorne(v: unknown, defaut: number, min: number, max: number): number {
  const s = typeof v === "number" ? v : String(v ?? "").trim();
  if (s === "") return defaut;
  const n = Number(s);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
