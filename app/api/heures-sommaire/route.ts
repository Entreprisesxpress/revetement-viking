import { NextRequest, NextResponse } from "next/server";
import { heuresParEmploye } from "@/lib/db";
import { entierBorne } from "@/lib/requete";
import { aujourdhuiMontreal } from "@/lib/date";
import { dateISOLocale } from "@/lib/calculs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // `depuis` explicite (ex. lundi de la semaine courante) prioritaire ; sinon fenêtre `jours`
  // (entier borné : `jours=abc` donnait une date NaN, donc un sommaire vide sans erreur).
  // La fenêtre se compte en jours de MONTRÉAL : en UTC, après 20 h, « 30 derniers jours »
  // en valait 29 (la page Rapports perdait une journée chaque soir).
  const depuisParam = sp.get("depuis");
  const jours = entierBorne(sp.get("jours"), 7, 1, 3660);
  const d = dateISOLocale(aujourdhuiMontreal());
  d.setDate(d.getDate() - jours);
  const depuis = depuisParam || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return NextResponse.json(await heuresParEmploye(depuis));
}
