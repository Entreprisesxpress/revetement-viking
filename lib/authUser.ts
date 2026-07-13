// Lit + valide le cookie d'auth, retourne le nom d'utilisateur courant (Gabriel ou Francis).
// Toute la logique de session vit dans lib/session.ts (source unique, edge-safe).
import type { NextRequest } from "next/server";
import { utilisateurDuCookie } from "@/lib/session";

export async function utilisateurActif(req: NextRequest | Request): Promise<string | null> {
  let cookieValue: string | undefined;
  if ("cookies" in req && typeof (req as NextRequest).cookies?.get === "function") {
    cookieValue = (req as NextRequest).cookies.get("xpress_auth")?.value;
  } else {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) cookieValue = cookieHeader.match(/(?:^|;\s*)xpress_auth=([^;]+)/)?.[1];
  }
  return utilisateurDuCookie(cookieValue);
}
