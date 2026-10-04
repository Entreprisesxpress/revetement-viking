import { NextRequest, NextResponse } from "next/server";
import { heuresParEmploye } from "@/lib/db";
import { entierBorne } from "@/lib/requete";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // `depuis` explicite (ex. lundi de la semaine courante) prioritaire ; sinon fenêtre `jours`
  // (entier borné : `jours=abc` donnait une date NaN, donc un sommaire vide sans erreur).
  const depuisParam = sp.get("depuis");
  const jours = entierBorne(sp.get("jours"), 7, 1, 3660);
  const depuis = depuisParam || new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
  return NextResponse.json(await heuresParEmploye(depuis));
}
