import { NextRequest, NextResponse } from "next/server";
import { listerPhotosErreursDrive, marquerDriveSync, getProjet } from "@/lib/db";
import { driveEstActif, trouverOuCreerSousDossier, uploaderFichier } from "@/lib/drive";

export const dynamic = "force-dynamic";

// Réessaie d'uploader sur Drive les photos dont la synchro avait échoué.
export async function POST(_req: NextRequest) {
  if (!(await driveEstActif())) {
    return NextResponse.json({ ok: false, error: "drive_inactif", message: "Connecte Google Drive d'abord." }, { status: 503 });
  }
  const photos = await listerPhotosErreursDrive();
  let synced = 0, restants = 0, ignores = 0;
  let dernierErreur = "";
  for (const p of photos) {
    // Enregistrement sans données (ex. vidéo, déjà sur Drive) → on efface simplement l'erreur.
    if (!p.photo_data || !/^data:/.test(String(p.photo_data))) {
      await marquerDriveSync(p.id, null, null).catch(() => {});
      ignores++;
      continue;
    }
    try {
      const projet = await getProjet(p.projet_id);
      const sousDossier = `${projet?.nom || "Projet " + p.projet_id} - Photos`;
      const dossierId = await trouverOuCreerSousDossier(sousDossier);
      const ext = p.photo_type?.includes("png") ? "png" : p.photo_type?.includes("pdf") ? "pdf" : p.photo_type?.startsWith("video/") ? "mp4" : "jpg";
      const nom = `${p.date}_${(p.description || "photo")}_${p.id}.${ext}`.replace(/[/\\]/g, "-");
      const up = await uploaderFichier({ nom, dataUrl: p.photo_data, dossierId, description: `Projet ${projet?.nom || ""} · ${p.date}` });
      await marquerDriveSync(p.id, up.id, null);
      synced++;
    } catch (e: any) {
      restants++;
      dernierErreur = e?.message?.slice(0, 200) || "erreur";
      try { await marquerDriveSync(p.id, null, dernierErreur); } catch {}
    }
  }
  return NextResponse.json({ ok: true, synced, ignores, restants, dernierErreur });
}
