import { NextRequest, NextResponse } from "next/server";
import { listerTachesClient, ajouterTacheClient, modifierTacheClient, supprimerTacheClient } from "@/lib/db";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export async function GET(req: NextRequest) {
  const cid = idEntier(req.nextUrl.searchParams.get("client_id"));
  if (!cid) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
  return NextResponse.json(await listerTachesClient(cid));
}
export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const clientId = idEntier(b.client_id);
  const titre = texte(b.titre, 200);
  if (!clientId || !titre) return NextResponse.json({ error: "client_id et titre requis" }, { status: 400 });
  const id = await ajouterTacheClient(clientId, titre, b.assignee, b.date_echeance);
  return NextResponse.json({ ok: true, id });
}
export async function PATCH(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (b.titre !== undefined) {
    b.titre = texte(b.titre, 200);
    if (!b.titre) return NextResponse.json({ error: "titre requis" }, { status: 400 });
  }
  const touche = await modifierTacheClient(id, { titre: b.titre, complete: typeof b.complete === "boolean" ? b.complete : undefined, assignee: b.assignee, date_echeance: b.date_echeance });
  if (!touche) return NextResponse.json({ error: "sous-tâche introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (!(await supprimerTacheClient(id))) return NextResponse.json({ error: "sous-tâche introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
