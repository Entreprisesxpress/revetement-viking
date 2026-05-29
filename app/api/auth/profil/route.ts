import { NextRequest, NextResponse } from "next/server";
import { getProfilUtilisateur, majProfilUtilisateur } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";

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
  const body = await req.json();
  await majProfilUtilisateur(user, {
    nom_affichage: body.nom_affichage,
    telephone: body.telephone,
    courriel: body.courriel,
    role: body.role,
    photo_data: body.photo_data,
    photo_type: body.photo_type,
  });
  return NextResponse.json({ ok: true });
}
