import { NextRequest, NextResponse } from "next/server";
import { db, initDb, getClient } from "@/lib/db";
import { idEntier } from "@/lib/requete";

export const dynamic = "force-dynamic";

/** Soumissions associées à un client (par client_id si lié, sinon par client_nom).
 *  Appelée par components/PipelineDrawer.tsx (rechargerSoumissions). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  const id = idEntier((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const cli = await getClient(id);
  if (!cli) return NextResponse.json([]);
  const r = await db().execute({
    // Par ID quand la soumission est liée (SCHEMA 30) ; les anciennes, sans lien, par le
    // nom. Avant : nom seulement — un homonyme voyait les soumissions de l'autre, et une
    // fiche renommée perdait les siennes.
    sql: `SELECT numero, projet, statut, total, date_creation, date_envoi, date_acceptation, date_refus
          FROM soumissions
          WHERE client_id = ? OR (client_id IS NULL AND LOWER(TRIM(client_nom)) = LOWER(TRIM(?)))
          ORDER BY date_creation DESC LIMIT 50`,
    args: [id, cli.nom],
  });
  return NextResponse.json(r.rows);
}
