import { NextRequest, NextResponse } from "next/server";
import { db, initDb, getClient } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Soumissions associées à un client (par client_id si lié, sinon par client_nom). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await initDb();
  const { id } = await ctx.params;
  const cli = await getClient(+id);
  if (!cli) return NextResponse.json([]);
  const r = await db().execute({
    sql: `SELECT numero, projet, statut, total, date_creation, date_envoi, date_acceptation, date_refus
          FROM soumissions
          WHERE LOWER(client_nom) = LOWER(?)
          ORDER BY date_creation DESC LIMIT 20`,
    args: [cli.nom],
  });
  return NextResponse.json(r.rows);
}
