// Cache localStorage avec TTL pour listes statiques (utilisateurs, catégories, etc.)
// Affiche instantanément la valeur cachée puis re-fetch en arrière-plan (stale-while-revalidate).

interface Cached<T> { v: T; ts: number }

export function lireCache<T>(cle: string, maxAgeMs: number): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`vk-cache-${cle}`);
    if (!raw) return null;
    const c: Cached<T> = JSON.parse(raw);
    if (Date.now() - c.ts > maxAgeMs) return null;
    return c.v;
  } catch { return null; }
}

export function ecrireCache<T>(cle: string, valeur: T): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(`vk-cache-${cle}`, JSON.stringify({ v: valeur, ts: Date.now() } as Cached<T>)); } catch {}
}

/** Stale-while-revalidate : retourne tout de suite la valeur cachée (si valide),
 * et déclenche en parallèle un fetch pour rafraîchir. */
export async function fetchAvecCache<T>(cle: string, fetcher: () => Promise<T>, opts: { ttl?: number; onUpdate?: (v: T) => void } = {}): Promise<T> {
  const ttl = opts.ttl ?? 24 * 60 * 60 * 1000;
  const cached = lireCache<T>(cle, ttl);
  if (cached !== null) {
    // Re-fetch en arrière-plan, met à jour le cache et notifie
    fetcher().then((v) => { ecrireCache(cle, v); opts.onUpdate?.(v); }).catch(() => {});
    return cached;
  }
  const v = await fetcher();
  ecrireCache(cle, v);
  return v;
}

export const TTL = {
  jour: 24 * 60 * 60 * 1000,
  heure: 60 * 60 * 1000,
  cinqMin: 5 * 60 * 1000,
};
