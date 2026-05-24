import { NextRequest, NextResponse } from "next/server";
import { rendementsMoyens, enregistrerRendement } from "@/lib/db";

export async function GET() {
  return NextResponse.json(await rendementsMoyens());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // body: { numero, lignes: [{ categorie, quantite, heuresEstimees, heuresReelles }] }
  if (Array.isArray(body.lignes)) {
    for (const l of body.lignes) {
      await enregistrerRendement(body.numero, l.categorie, l.quantite, l.heuresEstimees, l.heuresReelles);
    }
  }
  return NextResponse.json({ ok: true });
}
