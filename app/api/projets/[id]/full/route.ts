import { NextRequest, NextResponse } from "next/server";
import { getProjet, listerHeuresProjet, listerDepensesProjet, listerPhotosChantier, compterOngletsProjet } from "@/lib/db";
import { idEntier } from "@/lib/requete";

// Endpoint combiné : tout ce qu'il faut pour la page détail d'un projet en 1 seul
// aller-retour réseau (au lieu de 4 requêtes séparées). Gros gain sur mobile.
// Les compteurs des onglets Extras / Documents / Notes y sont joints (une requête de
// plus, en parallèle) : l'écran les lit s'ils sont des nombres, sinon il fait trois appels.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pid = idEntier(id);
    if (!pid) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const [projet, heures, depenses, photos, compteurs] = await Promise.all([
      getProjet(pid),
      listerHeuresProjet(pid),
      listerDepensesProjet(pid, { sansData: true }),
      listerPhotosChantier(pid, { sansData: true }),
      compterOngletsProjet(pid),
    ]);
    if (!projet) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ projet, heures, depenses, photos, ...compteurs }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e: any) {
    console.error("[/api/projets/[id]/full]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
