import { NextRequest, NextResponse } from "next/server";
import {
  listerCategoriesDepense, ajouterCategorieDepense,
  renommerCategorieDepense, supprimerCategorieDepense, reactiverCategorieDepense,
} from "@/lib/db";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export async function GET(req: NextRequest) {
  const toutes = req.nextUrl.searchParams.get("toutes") === "1";
  return NextResponse.json(await listerCategoriesDepense(!toutes));
}

export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const nom = texte(b.nom, 100);
  if (!nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
  try {
    const id = await ajouterCategorieDepense(nom);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message?.includes("UNIQUE") ? "Catégorie déjà existante" : (e?.message || "Erreur") }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const nom = texte(b.nom, 100);
  let touche: boolean;
  if (b.action === "reactiver") touche = await reactiverCategorieDepense(id);
  else if (nom) touche = await renommerCategorieDepense(id, nom);
  else return NextResponse.json({ error: "nom ou action requis" }, { status: 400 });
  if (!touche) return NextResponse.json({ error: "catégorie introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (!(await supprimerCategorieDepense(id))) return NextResponse.json({ error: "catégorie introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
