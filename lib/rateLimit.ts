// Rate limit basé sur journal_activite — pas besoin de Redis/Upstash
import { db, initDb } from "@/lib/db";

/** Compte les échecs `type` depuis le IP `ip` dans les `minutes` dernières minutes.
 *  Retourne true si la limite est atteinte. */
export async function rateLimitDepasse(type: string, ip: string | undefined, max: number, minutes: number): Promise<boolean> {
  if (!ip) return false;
  await initDb();
  const c = db();
  const seuil = new Date(Date.now() - minutes * 60_000).toISOString();
  const r = await c.execute({
    sql: `SELECT COUNT(*) as n FROM journal_activite WHERE type = ? AND ip = ? AND date > ?`,
    args: [type, ip, seuil],
  });
  const n = Number((r.rows[0] as any)?.n || 0);
  return n >= max;
}

/** Comparaison constant-time pour éviter timing attacks sur tokens. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
