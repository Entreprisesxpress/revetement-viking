import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, emailEstConfigure } from "@/lib/email";

export const dynamic = "force-dynamic";

const cad = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);

/** Cron hebdo (dimanche soir) : envoie un récap de la semaine à Francis + Gabriel. */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  if (!emailEstConfigure()) return NextResponse.json({ ok: false, raison: "email_non_configure" });

  const c: any = db();
  const il_y_a_7j = new Date(); il_y_a_7j.setDate(il_y_a_7j.getDate() - 7);
  const debut = il_y_a_7j.toISOString().slice(0, 10);

  // Heures par employé
  const rHeures = await c.execute({
    sql: `SELECT employe, SUM(heures) as h FROM heures_projet WHERE date >= ? GROUP BY employe ORDER BY h DESC`,
    args: [debut],
  }).catch(() => ({ rows: [] }));

  // Revenus (factures payées dans la semaine)
  const rRevenu = await c.execute({
    sql: `SELECT COALESCE(SUM(montant), 0) as r FROM factures_projet WHERE payee = 1 AND date >= ?`,
    args: [debut],
  }).catch(() => ({ rows: [{ r: 0 }] }));

  // Dépenses
  const rDepenses = await c.execute({
    sql: `SELECT COALESCE(SUM(montant), 0) as d, COUNT(*) as n FROM depenses_projet WHERE date >= ?`,
    args: [debut],
  }).catch(() => ({ rows: [{ d: 0, n: 0 }] }));

  // Nouvelles soumissions
  const rSoum = await c.execute({
    sql: `SELECT COUNT(*) as n, COALESCE(SUM(total), 0) as t FROM soumissions WHERE date_creation >= ?`,
    args: [debut],
  }).catch(() => ({ rows: [{ n: 0, t: 0 }] }));

  // Projets terminés cette semaine
  const rTermines = await c.execute({
    sql: `SELECT COUNT(*) as n FROM projets WHERE date_fin_reelle >= ?`,
    args: [debut],
  }).catch(() => ({ rows: [{ n: 0 }] }));

  const heuresTxt = (rHeures.rows as any[]).map((h) => `   • ${h.employe} : ${(+h.h).toFixed(1)} h`).join("\n") || "   (aucune)";
  const totalHeures = (rHeures.rows as any[]).reduce((s, h) => s + +h.h, 0);

  const corps = `Bonjour,

Voici le récap de la semaine passée (${debut} → aujourd'hui) :

💰 REVENUS
   Encaissé : ${cad(+(rRevenu.rows[0] as any).r)}

📋 SOUMISSIONS
   ${(rSoum.rows[0] as any).n} nouvelle(s) — total : ${cad(+(rSoum.rows[0] as any).t)}

⏱️ HEURES TRAVAILLÉES (total ${totalHeures.toFixed(1)} h)
${heuresTxt}

💸 DÉPENSES
   ${(rDepenses.rows[0] as any).n} entrée(s) — total : ${cad(+(rDepenses.rows[0] as any).d)}

✅ PROJETS TERMINÉS
   ${(rTermines.rows[0] as any).n} projet(s)

Ouvrir le tableau de bord :
https://app.revetementviking.com/

Bonne semaine !
— Revêtement Viking`;

  const destinataires = [process.env.FRANCIS_EMAIL, process.env.GABRIEL_EMAIL].filter(Boolean) as string[];
  let envoyes = 0;
  for (const d of destinataires) {
    const r = await sendEmail({ to: d, subject: `[Viking] Rapport hebdo — ${new Date().toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}`, text: corps });
    if (r.ok) envoyes++;
  }
  return NextResponse.json({ ok: true, envoyes });
}
