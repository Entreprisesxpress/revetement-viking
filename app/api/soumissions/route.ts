import { NextRequest, NextResponse } from "next/server";
import { sauvegarder, lister, charger, supprimer, changerStatut, enregistrerHeuresReelles, statistiques } from "@/lib/db";

export async function GET(req: NextRequest) {
  const numero = req.nextUrl.searchParams.get("numero");
  const stats = req.nextUrl.searchParams.get("stats");
  const statut = req.nextUrl.searchParams.get("statut") as any;

  if (stats === "1") return NextResponse.json(await statistiques());

  if (numero) {
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ...s, payload: JSON.parse(s.payload_json) });
  }
  return NextResponse.json(await lister(statut || undefined));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const numero = await sauvegarder(body);
  return NextResponse.json({ numero, ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.statut) await changerStatut(body.numero, body.statut);
  if (body.heuresReelles !== undefined) await enregistrerHeuresReelles(body.numero, body.heuresReelles);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const numero = req.nextUrl.searchParams.get("numero");
  if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
  await supprimer(numero);
  return NextResponse.json({ ok: true });
}
