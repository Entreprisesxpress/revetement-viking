import { NextRequest, NextResponse } from "next/server";
import { getProfilUtilisateur, majProfilUtilisateur } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { lireCorps, texte } from "@/lib/requete";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const p = (await getProfilUtilisateur(user)) || { username: user };
  return NextResponse.json(p);
}

export async function PATCH(req: NextRequest) {
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const body = await lireCorps(req);
  if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  await majProfilUtilisateur(user, {
    nom_affichage: texte(body.nom_affichage, 200),
    telephone: texte(body.telephone, 200),
    courriel: texte(body.courriel, 200),
    role: texte(body.role, 200),
    photo_data: body.photo_data,
    photo_type: texte(body.photo_type, 100),
  } as any);
  return NextResponse.json({ ok: true });
}
