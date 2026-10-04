import { NextRequest, NextResponse } from "next/server";
import { ajouterPhotoChantier, marquerDriveSync, getProjet } from "@/lib/db";
import { trouverOuCreerSousDossier, trouverFichierParNom } from "@/lib/drive";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export const dynamic = "force-dynamic";

// Enregistre une vidéo déjà uploadée sur Drive (référence seulement, pas de base64).
export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const projetId = idEntier(b.projet_id);
  const nom = texte(b.nom, 200);
  if (!projetId || !b.date || !nom) {
    return NextResponse.json({ error: "projet_id, date et nom requis" }, { status: 400 });
  }
  const projet = await getProjet(projetId);
  if (!projet) return NextResponse.json({ error: "projet introuvable" }, { status: 404 });
  // Résout l'id Drive : fourni par le client, sinon retrouvé par nom dans le dossier.
  let driveId: string | null = b.drive_id || null;
  if (!driveId) {
    const dossierId = await trouverOuCreerSousDossier(`${projet.nom || "Projet " + projetId} - Photos`);
    const f = await trouverFichierParNom(nom, dossierId);
    if (!f) {
      return NextResponse.json({ error: "fichier_introuvable", message: "Vidéo introuvable sur Drive (upload incomplet ?)." }, { status: 404 });
    }
    driveId = f.id;
  }
  const id = await ajouterPhotoChantier({
    projet_id: projetId,
    date: b.date,
    employes: texte(b.employes, 200) || "Manuel",
    photo_data: "", // pas de base64 : la vidéo vit sur Drive
    photo_type: b.mimeType || "video/mp4",
    description: texte(b.description, 500) || nom,
  });
  await marquerDriveSync(id, driveId, null);
  return NextResponse.json({ ok: true, id, drive_id: driveId });
}
