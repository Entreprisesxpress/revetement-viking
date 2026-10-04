import { NextRequest, NextResponse } from "next/server";
import { listerInteractions, ajouterInteraction, supprimerInteraction } from "@/lib/db";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export async function GET(req: NextRequest) {
  const client_id = idEntier(req.nextUrl.searchParams.get("client_id"));
  if (!client_id) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
  return NextResponse.json(await listerInteractions(client_id));
}

export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const client_id = idEntier(b.client_id);
  if (!client_id || !b.type || !b.date) return NextResponse.json({ error: "client_id, type, date requis" }, { status: 400 });
  const id = await ajouterInteraction({
    ...b, client_id,
    type: texte(b.type, 60),
    sujet: texte(b.sujet, 200) || undefined,
    note: texte(b.note, 2000) || undefined,
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (!(await supprimerInteraction(id))) return NextResponse.json({ error: "interaction introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
