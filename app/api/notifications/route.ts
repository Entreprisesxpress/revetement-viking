// Compteurs pour le badge de notifications dans la nav
import { NextResponse } from "next/server";
import { soumissionsARelancer, compterPhotosErreursDrive, listerTaches } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [relances, photosErr, tachesOuvertes] = await Promise.all([
      soumissionsARelancer().catch(() => []),
      compterPhotosErreursDrive().catch(() => 0),
      listerTaches({ statut: "a_faire" }).catch(() => []),
    ]);
    return NextResponse.json({
      total: relances.length + photosErr + tachesOuvertes.length,
      relances: relances.length,
      drive_erreurs: photosErr,
      taches_ouvertes: tachesOuvertes.length,
    }, {
      // Le badge poll toutes les 30s côté client : on garde 15s de cache CDN
      // pour absorber les pics sans frapper Turso à chaque ouverture d'onglet.
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ total: 0, relances: 0, drive_erreurs: 0, taches_ouvertes: 0 });
  }
}
