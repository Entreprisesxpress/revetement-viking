// Cache client "instantané" : affiche les dernières données connues tout de suite
// (depuis localStorage), puis va chercher le frais en arrière-plan et met à jour.
// Élimine le spinner d'attente sur cold start / réseau lent (chantier).

// Version du SCHÉMA de cache. Bumper ce numéro invalide tout le cache client
// (utile quand la forme des données change entre deux déploiements — évite qu'une
// vieille donnée en cache fasse planter un écran après une mise à jour).
// v3 : chaque entrée porte sa DATE ({ v, t }) pour pouvoir dire « données du … ».
const CACHE_VER = "3";
const PREFIXE = `vkc${CACHE_VER}:`;

/** En-tête posé par public/sw.js quand il sert une réponse API du cache hors ligne. */
export const EN_TETE_CACHE_PERIME = "X-Viking-Cache";

interface Entree<T> { v: T; t: number }

export function lireCacheLocalAvecDate<T>(cle: string): Entree<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const brut = localStorage.getItem(PREFIXE + cle);
    if (!brut) return null;
    const e = JSON.parse(brut);
    return e && typeof e === "object" && "v" in e && typeof e.t === "number" ? (e as Entree<T>) : null;
  } catch { return null; }
}

export function lireCacheLocal<T>(cle: string): T | null {
  const e = lireCacheLocalAvecDate<T>(cle);
  return e ? e.v : null;
}

export function ecrireCacheLocal(cle: string, data: any, date: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PREFIXE + cle, JSON.stringify({ v: data, t: date } satisfies Entree<any>)); }
  catch { /* quota plein / mode privé — on ignore */ }
}

// Purge les caches d'anciennes versions (vk:, vkc1:, …) une fois au chargement.
if (typeof window !== "undefined") {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("vk:") || (/^vkc\d+:/.test(k) && !k.startsWith(PREFIXE)))) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

/** Ce que `appliquer` reçoit en plus des données.
 *  `perime` : les données ne viennent PAS du serveur à l'instant (cache local gardé
 *  après un échec réseau, ou copie servie par le service worker hors ligne) ; `date` est
 *  le moment où elles ont été obtenues, pour l'afficher. */
export interface MetaInstantane { perime: boolean; date?: number }

/** Lit la date d'une réponse servie du cache par le SW (son en-tête Date), sinon maintenant. */
function dateReponse(r: Response): number {
  const d = Date.parse(r.headers?.get?.("date") || "");
  return Number.isFinite(d) ? d : Date.now();
}

/**
 * Affiche le cache local immédiatement (si présent), puis fetch le frais et met à jour.
 * @param url       endpoint à charger
 * @param appliquer setter d'état (reçoit les données, et une méta { perime, date })
 * @param opts.cle  clé de cache (défaut = url) — utiliser une clé stable
 * @param opts.transform  transforme la réponse brute avant application/cache
 *
 * Échec réseau (V-41) : avant, le cache restait affiché EN SILENCE ; maintenant
 * `appliquer(cache, { perime: true, date })` est rappelé pour que l'écran le dise.
 * Copie servie par le service worker hors ligne (V-42) : reconnue à l'en-tête
 * X-Viking-Cache, elle n'est PAS réécrite dans localStorage (elle écrasait la date du
 * cache avec une donnée tout aussi vieille) et arrive avec `perime: true`.
 */
export async function fetchInstantane<T>(
  url: string,
  appliquer: (d: T, meta: MetaInstantane) => void,
  opts: { cle?: string; transform?: (raw: any) => T } = {},
): Promise<void> {
  const cle = opts.cle || url;
  const cache = lireCacheLocalAvecDate<T>(cle);
  if (cache) appliquer(cache.v, { perime: false, date: cache.t }); // 1) instantané
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();
    const d = opts.transform ? opts.transform(raw) : (raw as T);
    const perime = (r.headers?.get?.(EN_TETE_CACHE_PERIME) || "") === "stale";
    if (perime) {
      appliquer(d, { perime: true, date: dateReponse(r) }); // 2) copie hors ligne du SW
      return;
    }
    appliquer(d, { perime: false });            // 2) frais
    ecrireCacheLocal(cle, d);                  // 3) mémorise pour la prochaine ouverture
  } catch {
    // réseau KO / 401 : on garde l'affichage du cache, mais on le DIT
    if (cache) appliquer(cache.v, { perime: true, date: cache.t });
  }
}
