import { NextRequest, NextResponse } from "next/server";
import { ajouterJobBiblio, listerJobsBiblio, supprimerJobBiblio, jobsSimilaires } from "@/lib/db";
import fs from "fs";
import path from "path";

const PHOTOS_DIR = path.join(process.cwd(), "data", "photos-biblio");
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

export async function GET(req: NextRequest) {
  const similaires = req.nextUrl.searchParams.get("similaires_pour");
  const materiau = req.nextUrl.searchParams.get("materiau") || undefined;
  if (similaires) {
    const jobs = await jobsSimilaires(+similaires, materiau, 5);
    return NextResponse.json(jobs);
  }
  return NextResponse.json(await listerJobsBiblio());
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    let payload: any;

    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      // Sauvegarder les photos
      const photoPaths: string[] = [];
      for (let i = 0; i < 20; i++) {
        const f = fd.get(`photo_${i}`) as File | null;
        if (!f) continue;
        const buf = Buffer.from(await f.arrayBuffer());
        const name = `${Date.now()}_${i}_${f.name.replace(/[^a-z0-9.]/gi, "_")}`;
        const p = path.join(PHOTOS_DIR, name);
        fs.writeFileSync(p, buf);
        photoPaths.push(name);
      }
      payload = {
        adresse: fd.get("adresse") as string,
        type_materiau: fd.get("type_materiau") as string,
        parement_pi2: +(fd.get("parement_pi2") as string || 0),
        fascia_pi_lin: +(fd.get("fascia_pi_lin") as string || 0),
        soffite_pi2: +(fd.get("soffite_pi2") as string || 0),
        nb_etages: +(fd.get("nb_etages") as string || 1),
        total_soumission: +(fd.get("total_soumission") as string || 0),
        heures_reelles: +(fd.get("heures_reelles") as string || 0),
        notes_chantier: fd.get("notes_chantier") as string,
        complexite: fd.get("complexite") as string,
        hover_data_json: fd.get("hover_data_json") as string,
        soumission_data_json: fd.get("soumission_data_json") as string,
        photos_json: JSON.stringify(photoPaths),
      };
    } else {
      payload = await req.json();
    }

    const id = await ajouterJobBiblio({ ...payload, date_ajout: new Date().toISOString() });
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerJobBiblio(+id);
  return NextResponse.json({ ok: true });
}
