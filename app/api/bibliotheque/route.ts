import { NextRequest, NextResponse } from "next/server";
import { ajouterJobBiblio, listerJobsBiblio, supprimerJobBiblio, jobsSimilaires, ajouterPhotosBiblio } from "@/lib/db";
import { idEntier, lireCorps } from "@/lib/requete";

// Les photos vont en BASE (table bibliotheque_photos), plus sur le disque local : sur Vercel
// le système de fichiers est éphémère, les fichiers écrits disparaissaient au déploiement
// suivant — et aucune route ne les servait de toute façon.
const MAX_PHOTOS = 10;
const MAX_PHOTO = 3 * 1024 * 1024; // 3 Mo par photo APRÈS compression côté navigateur

export async function GET(req: NextRequest) {
  const similaires = req.nextUrl.searchParams.get("similaires_pour");
  const materiau = req.nextUrl.searchParams.get("materiau") || undefined;
  if (similaires) {
    // Une surface (pi²), pas un id : nombre fini > 0 exigé (« abc » donnait NaN en SQL).
    const surface = Number(similaires);
    if (!Number.isFinite(surface) || surface <= 0) return NextResponse.json({ error: "similaires_pour invalide (surface en pi²)" }, { status: 400 });
    const jobs = await jobsSimilaires(surface, materiau, 5);
    return NextResponse.json(jobs);
  }
  return NextResponse.json(await listerJobsBiblio());
}

export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const { photos, ...payload } = body;

    const id = await ajouterJobBiblio({ ...payload, photos_json: null, date_ajout: new Date().toISOString() });

    // Photos : dataURL déjà compressées côté navigateur (lib/img.ts). Un seul lot
    // d'INSERT (un aller-retour) au lieu d'un INSERT par photo.
    let enregistrees = 0, ignorees = 0;
    if (Array.isArray(photos)) {
      const valides: { data: string; type: string }[] = [];
      for (const p of photos.slice(0, MAX_PHOTOS)) {
        const m = typeof p === "string" ? p.match(/^data:(image\/[a-zA-Z+]+);base64,/) : null;
        if (!m || p.length > MAX_PHOTO) { ignorees++; continue; }
        valides.push({ data: p, type: m[1] });
      }
      enregistrees = await ajouterPhotosBiblio(id, valides);
    }
    return NextResponse.json({ ok: true, id, photos: enregistrees, photos_ignorees: ignorees });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (!(await supprimerJobBiblio(id))) return NextResponse.json({ error: "job introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
