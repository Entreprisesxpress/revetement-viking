// Journal des coûts IA — enregistre les tokens et le coût estimé de chaque appel Jarvis.
import { db, initDb } from "@/lib/db";

// Tarifs Claude Opus 4.8 (USD par 1M tokens) — cache écriture = 1,25× input, lecture = 0,1×.
const PRIX = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

export interface UsageIA { input?: number; output?: number; cacheWrite?: number; cacheRead?: number; }

/** Coût USD d'un usage de tokens. */
export function coutUSD(u: UsageIA): number {
  const c =
    (u.input || 0) * PRIX.input +
    (u.output || 0) * PRIX.output +
    (u.cacheWrite || 0) * PRIX.cacheWrite +
    (u.cacheRead || 0) * PRIX.cacheRead;
  return c / 1_000_000;
}

async function assurerTable(): Promise<void> {
  await initDb();
  await db().execute(
    `CREATE TABLE IF NOT EXISTS ia_couts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       outil TEXT, model TEXT,
       input_tokens INTEGER, output_tokens INTEGER,
       cache_write_tokens INTEGER, cache_read_tokens INTEGER,
       cout_usd REAL, utilisateur TEXT, date TEXT
     )`
  ).catch(() => {});
}

/** Enregistre un appel IA (best-effort — ne fait jamais échouer l'appel). Retourne le coût USD. */
export async function enregistrerCoutIA(p: { outil: string; model: string; usage: UsageIA; user?: string | null }): Promise<number> {
  const cout = coutUSD(p.usage);
  try {
    await assurerTable();
    await db().execute({
      sql: `INSERT INTO ia_couts (outil, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cout_usd, utilisateur, date)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        p.outil, p.model,
        p.usage.input || 0, p.usage.output || 0, p.usage.cacheWrite || 0, p.usage.cacheRead || 0,
        cout, p.user || null, new Date().toISOString(),
      ],
    });
  } catch { /* best-effort */ }
  return cout;
}

/** Total du mois courant (USD) + nombre d'appels. */
export async function coutMoisCourantIA(): Promise<{ mois: string; total_usd: number; nb: number }> {
  const mois = new Date().toISOString().slice(0, 7); // AAAA-MM
  try {
    await assurerTable();
    const r = await db().execute({
      sql: "SELECT COALESCE(SUM(cout_usd),0) t, COUNT(*) n FROM ia_couts WHERE date LIKE ?",
      args: [`${mois}%`],
    });
    return { mois, total_usd: Number((r.rows[0] as any)?.t) || 0, nb: Number((r.rows[0] as any)?.n) || 0 };
  } catch {
    return { mois, total_usd: 0, nb: 0 };
  }
}
