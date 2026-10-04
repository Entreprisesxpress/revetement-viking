import { NextRequest, NextResponse } from "next/server";
import { listerFichiersClient, ajouterFichierClient, supprimerFichierClient } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export async function GET(req: NextRequest) {
  const cid = idEntier(req.nextUrl.searchParams.get("client_id"));
  if (!cid) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
  return NextResponse.json(await listerFichiersClient(cid));
}

export async function POST(req: NextRequest) {
  const body = await lireCorps(req);
  if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const clientId = idEntier(body.client_id);
  if (!clientId || !body.data) return NextResponse.json({ error: "client_id et data requis" }, { status: 400 });
  const user = await utilisateurActif(req);
  const id = await ajouterFichierClient({
    client_id: clientId,
    nom: texte(body.nom, 200) || "fichier",
    type: texte(body.type, 100) || "application/octet-stream",
    data: body.data,
    taille: body.taille,
    ajoute_par: user || undefined,
  });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (!(await supprimerFichierClient(id))) return NextResponse.json({ error: "fichier introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
