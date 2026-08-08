import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { listerPhotosChantier, getPhotoChantier, ajouterPhotoChantier, supprimerPhotoChantier, getProjet, marquerDriveSync, marquerDriveEnAttente } from "@/lib/db";
import { driveEstActif, trouverOuCreerSousDossier, uploaderFichier } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (id) return NextResponse.json(await getPhotoChantier(+id));
  const projet_id = sp.get("projet_id");
  const sansData = sp.get("data") === "0";
  return NextResponse.json(await listerPhotosChantier(projet_id ? +projet_id : undefined, { sansData }));
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.projet_id || !b.date || !b.photo_data) {
    return NextResponse.json({ error: "projet_id, date et photo_data requis" }, { status: 400 });
  }
  const id = await ajouterPhotoChantier(b);

  // Push Drive si actif. Deux garde-fous, parce qu'une fonction serverless peut être
  // arrêtée dès la réponse envoyée :
  //  1) on marque la photo « en attente » AVANT de commencer → si l'envoi est interrompu,
  //     elle reste repérable et le bouton « Resynchroniser » la reprendra (avant, elle
  //     n'arrivait ni sur Drive ni dans le journal d'erreurs : perdue en silence) ;
  //  2) after() confie le travail à la plateforme, qui maintient la fonction en vie après
  //     la réponse — contrairement à une promesse lancée et non attendue.
  const driveActif = await driveEstActif();
  if (driveActif) {
    await marquerDriveEnAttente(id).catch(() => {});
    after(async () => {
      try {
        const projet = await getProjet(+b.projet_id);
        const sousDossier = `${projet?.nom || "Projet " + b.projet_id} - Photos`;
        const dossierId = await trouverOuCreerSousDossier(sousDossier);
        const ext = b.photo_type?.includes("png") ? "png" : b.photo_type?.includes("pdf") ? "pdf" : b.photo_type?.startsWith("video/") ? "mp4" : "jpg";
        const nom = `${b.date}_${b.description || "photo"}_${id}.${ext}`.replace(/[/\\]/g, "-");
        const up = await uploaderFichier({ nom, dataUrl: b.photo_data, dossierId, description: `Projet ${projet?.nom || ""} · ${b.date} · ${b.employes || ""}` });
        await marquerDriveSync(id, up.id, null);   // succès : le marqueur d'attente est levé
      } catch (e: any) {
        console.warn("Drive sync failed:", e.message);
        try { await marquerDriveSync(id, null, e.message?.slice(0, 500) || "erreur inconnue"); } catch {}
      }
    });
  }

  return NextResponse.json({ ok: true, id, drive_sync: driveActif });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerPhotoChantier(+id);
  return NextResponse.json({ ok: true });
}
