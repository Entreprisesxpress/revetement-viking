import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, emailEstConfigure } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Cron quotidien : détecte les soumissions ENVOYÉES sans réponse depuis 7+ jours
 *  et envoie un email récap à Francis (assigne par défaut). */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // Fail-closed : sans CRON_SECRET, route désactivée (sinon déclenchable publiquement).
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET non configuré — route désactivée" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  if (!emailEstConfigure()) return NextResponse.json({ ok: false, raison: "email_non_configure" });

  const dest = process.env.FRANCIS_EMAIL || process.env.GABRIEL_EMAIL;
  if (!dest) return NextResponse.json({ ok: false, raison: "aucun_dest" });

  const il_y_a_7j = new Date(); il_y_a_7j.setDate(il_y_a_7j.getDate() - 7);
  const seuil = il_y_a_7j.toISOString().slice(0, 10);

  const c: any = db();
  const r = await c.execute({
    sql: `SELECT numero, client_nom, client_courriel, total, date_envoi FROM soumissions WHERE statut = 'envoyee' AND date_envoi IS NOT NULL AND date_envoi < ? ORDER BY date_envoi ASC LIMIT 50`,
    args: [seuil],
  }).catch(() => ({ rows: [] }));
  const liste = r.rows as any[];
  if (liste.length === 0) return NextResponse.json({ ok: true, nb: 0 });

  const lignes = liste.map((s) => {
    const jours = Math.round((Date.now() - new Date(s.date_envoi).getTime()) / 86400000);
    const total = s.total ? `${s.total.toFixed(2)} $` : "?";
    return `• ${s.client_nom || "?"} — ${s.numero} — ${total} — envoyée il y a ${jours} jours${s.client_courriel ? ` (${s.client_courriel})` : ""}`;
  }).join("\n");

  await sendEmail({
    to: dest,
    subject: `[Viking] ${liste.length} soumission(s) à relancer (>7 jours)`,
    text: `Bonjour Francis,\n\nVoici les soumissions envoyées sans réponse depuis plus de 7 jours :\n\n${lignes}\n\nOuvrir : https://app.revetementviking.com/soumissions?statut=envoyee\n\n— Revêtement Viking Inc.`,
  });

  return NextResponse.json({ ok: true, nb: liste.length });
}
