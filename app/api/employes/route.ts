import { NextRequest, NextResponse } from "next/server";
import { listerEmployes, ajouterEmploye, modifierEmploye, supprimerEmploye, getEmploye } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) return NextResponse.json(await getEmploye(+id));
  const data = await listerEmployes();
  // Liste des employés change très rarement → cache CDN 60s avec SWR 5 min
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=30, s-maxage=60, stale-while-revalidate=300" },
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.nom?.trim() || !b.taux_horaire) {
    return NextResponse.json({ error: "nom et taux_horaire requis" }, { status: 400 });
  }
  const id = await ajouterEmploye({ nom: b.nom.trim(), taux_horaire: +b.taux_horaire, das_pct: b.das_pct ?? 0.15 });
  // ajouterEmploye n'insère que les colonnes de base : sans ce complément, une case
  // « Reçoit un talon » décochée à la création était ignorée (défaut SQL = 1).
  const extras: any = {};
  for (const k of ["recoit_talon", "telephone", "courriel", "adresse", "date_naissance", "nas",
                   "date_embauche", "poste", "contact_urgence_nom", "contact_urgence_lien",
                   "contact_urgence_tel", "specimen_cheque_data", "specimen_cheque_type", "notes"]) {
    if (b[k] !== undefined && b[k] !== "") extras[k] = b[k];
  }
  if (Object.keys(extras).length) await modifierEmploye(id, extras);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await modifierEmploye(+b.id, b);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerEmploye(+id);
  return NextResponse.json({ ok: true });
}
