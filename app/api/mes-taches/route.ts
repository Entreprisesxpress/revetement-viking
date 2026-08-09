import { NextRequest, NextResponse } from "next/server";
import { tachesPourUtilisateur } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";

export async function GET(req: NextRequest) {
  // L'identité vient du COOKIE, jamais du paramètre : `?user=Gabriel` permettait à
  // n'importe qui de lire la liste de tâches de l'autre.
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json([]);
  return NextResponse.json(await tachesPourUtilisateur(user));
}
