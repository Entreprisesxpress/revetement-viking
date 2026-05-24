// Authentification simple par mot de passe partagé
// Utilise un cookie HTTP-only pour la session
// Mot de passe configuré dans la variable env APP_PASSWORD

import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "xpress_auth";
const COOKIE_VALUE_PREFIX = "ok:";

export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  // Si pas de mot de passe configuré (dev local), on laisse passer
  if (!password) return NextResponse.next();

  const path = req.nextUrl.pathname;

  // Routes publiques (login)
  if (path === "/login" || path.startsWith("/_next") || path.startsWith("/api/login") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  // Vérifier le cookie
  const cookie = req.cookies.get(COOKIE_NAME);
  const valide = cookie && cookie.value === `${COOKIE_VALUE_PREFIX}${password}`;

  if (!valide) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
