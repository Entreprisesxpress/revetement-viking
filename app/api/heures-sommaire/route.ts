import { NextRequest, NextResponse } from "next/server";
import { heuresParEmploye } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // `depuis` explicite (ex. lundi de la semaine courante) prioritaire ; sinon fenêtre `jours`.
  const depuisParam = sp.get("depuis");
  const depuis = depuisParam || new Date(Date.now() - (+(sp.get("jours") || "7")) * 86400000).toISOString().slice(0, 10);
  return NextResponse.json(await heuresParEmploye(depuis));
}
