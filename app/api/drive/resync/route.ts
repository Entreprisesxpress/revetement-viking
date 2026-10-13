import { NextRequest, NextResponse } from "next/server";
import { listerPhotosErreursDrive, marquerDriveSync, nomsProjets } from "@/lib/db";
import { driveEstActif, trouverOuCreerSousDossier, uploaderFichier, trouverFichierParNom } from "@/lib/drive";

export const dynamic = "force-dynamic";
// Un envoi Drive par photo (plusieurs Mo chacune) : bien au-delà des 60 s par défaut.
export const maxDuration = 300;
// Un LOT de photos par appel : avant, toutes les photos en échec partaient dans la même
// fonction, qui mourait au plafond de temps sans réponse — l'écran restait « en cours ».
// La réponse porte `reste` (photos encore à reprendre APRÈS ce lot) et `dernier_id` : l'écran
// rappelle avec `apres_id = dernier_id` tant que reste > 0, donc chaque photo est tentée
// UNE fois par resynchro. Avant, sans curseur, dix photos irrécupérables revenaient en tête
// de chaque lot : vingt tours sur les mêmes, les autres jamais tentées, « 200 en échec ».
const TAILLE_LOT = 10;

// Réessaie d'uploader sur Drive les photos dont la synchro avait échoué.
export async function POST(req: NextRequest) {
  if (!(await driveEstActif())) {
    return NextResponse.json({ ok: false, error: "drive_inactif", message: "Connecte Google Drive d'abord." }, { status: 503 });
  }
  const corps = await req.json().catch(() => ({}));
  const apresId = Number(corps?.apres_id) || 0;
  const toutes = await listerPhotosErreursDrive(apresId);
  const photos = toutes.slice(0, TAILLE_LOT);
  // Noms de projets préchargés en UNE requête (avant : un getProjet() — PROJ_SQL et ses
  // sept sous-requêtes — par photo), et un seul appel Drive par dossier de projet.
  const noms = await nomsProjets(photos.map((p) => Number(p.projet_id)));
  const dossiers = new Map<string, Promise<string>>();
  const dossierPour = (sousDossier: string) => {
    if (!dossiers.has(sousDossier)) dossiers.set(sousDossier, trouverOuCreerSousDossier(sousDossier));
    return dossiers.get(sousDossier)!;
  };
  let synced = 0, restants = 0, ignores = 0, retrouvees = 0;
  let dernierErreur = "";
  for (const p of photos) {
    // Enregistrement sans données (ex. vidéo, déjà sur Drive) → on efface simplement l'erreur.
    if (!p.photo_data || !/^data:/.test(String(p.photo_data))) {
      await marquerDriveSync(p.id, null, null).catch(() => {});
      ignores++;
      continue;
    }
    try {
      const nomProjet = noms.get(Number(p.projet_id)) || "";
      const sousDossier = `${nomProjet || "Projet " + p.projet_id} - Photos`;
      const dossierId = await dossierPour(sousDossier);
      const ext = p.photo_type?.includes("png") ? "png" : p.photo_type?.includes("pdf") ? "pdf" : p.photo_type?.startsWith("video/") ? "mp4" : "jpg";
      const nom = `${p.date}_${(p.description || "photo")}_${p.id}.${ext}`.replace(/[/\\]/g, "-");
      // Déjà sur Drive (envoi réussi mais marquage raté la fois d'avant) : on rattache le
      // fichier existant au lieu d'en déposer un second exemplaire.
      const deja = await trouverFichierParNom(nom, dossierId).catch(() => null);
      if (deja) {
        await marquerDriveSync(p.id, deja.id, null);
        retrouvees++;
        continue;
      }
      const up = await uploaderFichier({ nom, dataUrl: p.photo_data, dossierId, description: `Projet ${nomProjet} · ${p.date}` });
      await marquerDriveSync(p.id, up.id, null);
      synced++;
    } catch (e: any) {
      restants++;
      dernierErreur = e?.message?.slice(0, 200) || "erreur";
      try { await marquerDriveSync(p.id, null, dernierErreur); } catch {}
    }
  }
  // `reste` : photos en échec APRÈS ce lot (à rappeler avec `apres_id`).
  // `restants` : photos tentées dans ce lot et toujours en échec.
  const reste = Math.max(0, toutes.length - photos.length);
  const dernier_id = photos.length ? Math.max(...photos.map((p) => Number(p.id))) : apresId;
  return NextResponse.json({ ok: true, synced: synced + retrouvees, retrouvees, ignores, restants, reste, dernier_id, dernierErreur });
}
