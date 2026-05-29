// Compteurs + items pour le badge et le dropdown de notifications dans la nav.
// Per-user : @mentions reçues + relances dues qui me sont assignées.
import { NextRequest, NextResponse } from "next/server";
import {
  soumissionsARelancer, compterPhotosErreursDrive, listerTaches,
  mentionsRecentes, relancesPourUser,
} from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await utilisateurActif(req);
    const [relancesSoum, photosErr, tachesOuvertes, mentions, mesRelances] = await Promise.all([
      soumissionsARelancer().catch(() => []),
      compterPhotosErreursDrive().catch(() => 0),
      listerTaches({ statut: "a_faire" }).catch(() => []),
      user ? mentionsRecentes(user).catch(() => []) : Promise.resolve([]),
      user ? relancesPourUser(user).catch(() => []) : Promise.resolve([]),
    ]);
    const total =
      relancesSoum.length + photosErr + tachesOuvertes.length +
      mentions.length + mesRelances.length;
    return NextResponse.json({
      user,
      total,
      relances: relancesSoum.length,
      drive_erreurs: photosErr,
      taches_ouvertes: tachesOuvertes.length,
      mentions: mentions.length,
      mes_relances: mesRelances.length,
      mentions_items: mentions.slice(0, 10),
      relances_items: mesRelances.slice(0, 10),
    }, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ total: 0, relances: 0, drive_erreurs: 0, taches_ouvertes: 0, mentions: 0, mes_relances: 0, mentions_items: [], relances_items: [] });
  }
}
