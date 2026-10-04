import { NextRequest, NextResponse } from "next/server";
import { getProjet } from "@/lib/db";
import { driveEstActif, trouverOuCreerSousDossier, creerSessionUploadResumable } from "@/lib/drive";
import { idEntier, lireCorps } from "@/lib/requete";

export const dynamic = "force-dynamic";

// Crée une session d'upload résumable Drive pour une vidéo. Le navigateur enverra
// ensuite le fichier directement à Drive (gros fichiers, contourne la limite serveur).
export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const projetId = idEntier(b.projet_id);
  if (!projetId || !b.mimeType || typeof b.mimeType !== "string") {
    return NextResponse.json({ error: "projet_id et mimeType requis" }, { status: 400 });
  }
  if (!(await driveEstActif())) {
    return NextResponse.json({ error: "drive_inactif", message: "Connecte Google Drive avant d'envoyer des vidéos (Paramètres)." }, { status: 503 });
  }
  const projet = await getProjet(projetId);
  if (!projet) return NextResponse.json({ error: "projet introuvable" }, { status: 404 });
  const sousDossier = `${projet.nom || "Projet " + projetId} - Photos`;
  const dossierId = await trouverOuCreerSousDossier(sousDossier);
  const ext = (b.mimeType.split("/")[1] || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "mp4";
  const base = `${b.date || ""}_${(b.description || "video")}`.replace(/[/\\]/g, "-").slice(0, 60);
  const nom = `${base}_${Date.now()}.${ext}`;
  try {
    const { uploadUrl } = await creerSessionUploadResumable({ nom, mimeType: b.mimeType, dossierId, description: `Vidéo · ${projet.nom || ""} · ${b.date || ""}` });
    return NextResponse.json({ ok: true, uploadUrl, nom });
  } catch (e: any) {
    return NextResponse.json({ error: "session_drive_echec", message: e?.message || "erreur" }, { status: 500 });
  }
}
