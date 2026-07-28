import type { NextRequest } from "next/server";

/** Origine publique fiable pour construire un lien absolu envoyé par courriel (ex. lien de
 *  signature de contrat). Priorité : APP_PUBLIC_URL (override explicite, à configurer sur
 *  Vercel si le domaine public diffère du Host vu par le serveur) > en-têtes forwarded posés
 *  par le proxy/edge > Host brut. Ne dépend jamais de l'en-tête "Origin", absent sur beaucoup
 *  de requêtes non-CORS. */
export function publicOrigin(req: NextRequest): string {
  const override = process.env.APP_PUBLIC_URL;
  if (override) return override.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}
