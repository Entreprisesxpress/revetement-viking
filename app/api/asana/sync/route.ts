import { NextRequest, NextResponse } from "next/server";
import { listerTachesSoumission, parserNotesAsana, asanaEstConfigure } from "@/lib/asana";
import { listerClients, ajouterClient, modifierClient } from "@/lib/db";

/**
 * POST /api/asana/sync — pull les tâches Asana vers le CRM
 * Idempotent : utilise asana_gid comme clé de liaison.
 * - Nouvelles tâches Asana → créées dans le CRM
 * - Tâches Asana modifiées plus récemment → MAJ dans CRM
 * - Tâches Asana fermées → statut "complete" dans le CRM (ou "perdu" selon contexte)
 */
export async function POST(_req: NextRequest) {
  if (!asanaEstConfigure()) {
    return NextResponse.json({ error: "ASANA_PAT non configuré dans Vercel Environment Variables" }, { status: 400 });
  }

  try {
    const tachesAsana = await listerTachesSoumission();
    const clients = await listerClients();
    const parGid = new Map<string, any>();
    for (const c of clients) if (c.asana_gid) parGid.set(c.asana_gid, c);

    let crees = 0, majs = 0, ignores = 0;
    for (const t of tachesAsana) {
      const existant = parGid.get(t.gid);
      const infos = parserNotesAsana(t);
      const tagsBase = "Asana, Soumission 2026";

      if (existant) {
        // MAJ si Asana plus récent
        const dejaSync = existant.asana_modifie_le || "";
        if (t.modified_at && t.modified_at > dejaSync) {
          await modifierClient(existant.id, {
            nom: infos.nom,
            telephone: infos.telephone,
            courriel: infos.courriel,
            adresse: infos.adresse,
            notes: infos.notes,
            statut: t.completed ? "actif" : (existant.statut || "prospect"),
            asana_modifie_le: t.modified_at,
          });
          majs++;
        } else {
          ignores++;
        }
      } else {
        // Création
        await ajouterClient({
          nom: infos.nom,
          telephone: infos.telephone,
          courriel: infos.courriel,
          adresse: infos.adresse,
          notes: infos.notes,
          statut: t.completed ? "actif" : "prospect",
          source: "Asana",
          tags: tagsBase,
          asana_gid: t.gid,
          asana_modifie_le: t.modified_at,
        } as any);
        crees++;
      }
    }

    return NextResponse.json({
      ok: true,
      total_taches_asana: tachesAsana.length,
      crees, majs, ignores,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    configure: asanaEstConfigure(),
    message: asanaEstConfigure()
      ? "Asana est configuré. Appelle POST /api/asana/sync pour synchroniser."
      : "Asana n'est pas configuré. Ajoute ASANA_PAT dans les variables d'environnement Vercel.",
  });
}
