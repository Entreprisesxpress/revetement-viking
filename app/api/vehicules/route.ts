import { NextRequest, NextResponse } from "next/server";
import { listerVehicules, ajouterVehicule, modifierVehicule, supprimerVehicule } from "@/lib/db";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export const dynamic = "force-dynamic";
function fail(e: any) { console.error("[/api/vehicules]", e); return NextResponse.json({ error: e?.message || "erreur" }, { status: 500 }); }

/** `annee` : entier entre 1950 et l'an prochain, ou vide (null). « abc » entrait tel quel. */
function normaliser(b: any): string | null {
  b.nom = texte(b.nom, 200);
  if (b.annee !== undefined) {
    if (b.annee === null || b.annee === "") b.annee = null;
    else {
      const a = Number(b.annee);
      const max = new Date().getFullYear() + 1;
      if (!Number.isInteger(a) || a < 1950 || a > max) return `annee invalide (entier entre 1950 et ${max})`;
      b.annee = a;
    }
  }
  return null;
}

export async function GET() {
  try { return NextResponse.json(await listerVehicules(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  try {
    const b = await lireCorps(req);
    if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const invalide = normaliser(b);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    if (!b.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    const id = await ajouterVehicule(b);
    return NextResponse.json({ ok: true, id });
  } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  try {
    const b = await lireCorps(req);
    if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const id = idEntier(b.id);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const invalide = normaliser(b);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    if (b.nom !== undefined && !b.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    if (!(await modifierVehicule(id, b))) return NextResponse.json({ error: "véhicule introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    const id = idEntier(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    if (!(await supprimerVehicule(id))) return NextResponse.json({ error: "véhicule introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
