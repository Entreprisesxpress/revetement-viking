// Réponse HTTP pour un fichier stocké en base (photo, reçu, document, contrat, facture).
//
// Une seule règle pour les six routes qui servent des octets. Avant, chacune renvoyait
// le type MIME tel que le NAVIGATEUR l'avait déclaré au dépôt (`data:…;base64`), en
// `inline`. Un dépôt déclaré `text/html` ou `image/svg+xml` était donc rendu sur l'origine
// de l'app, avec sa CSP `'unsafe-inline'` : script exécuté dans la session de celui qui
// ouvre le lien. Ici : seuls les types qu'un navigateur doit AFFICHER passent en inline ;
// tout le reste est servi en `application/octet-stream` + `attachment` (téléchargé, jamais
// rendu), et `nosniff` empêche le navigateur de deviner autre chose.

import { NextResponse } from "next/server";

/** Types rendus dans le navigateur. Pas de SVG (scriptable), pas de HTML. */
const AFFICHABLES = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif", "image/bmp",
  "video/mp4", "video/quicktime", "video/webm",
  "text/plain",
]);

export function typeAffichable(type: string | null | undefined): boolean {
  return AFFICHABLES.has(String(type || "").toLowerCase().split(";")[0].trim());
}

/** Extension de fichier plausible pour un type MIME (« image/jpeg » → « jpeg »). */
export function extensionDe(type: string | null | undefined): string {
  const t = String(type || "").toLowerCase().split(";")[0].trim();
  const ext = (t.split("/")[1] || "bin").split("+")[0];
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

export function reponseFichier(
  buf: Buffer,
  opts: { type?: string | null; nom: string; cacheSecondes?: number },
): NextResponse {
  const type = String(opts.type || "").toLowerCase().split(";")[0].trim();
  const affichable = AFFICHABLES.has(type);
  const nom = (opts.nom || "fichier").replace(/[^a-z0-9._ ()-]/gi, "_");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": affichable ? type : "application/octet-stream",
      "Content-Length": String(buf.length),
      // `private` : derrière l'authentification, jamais gardé par un cache partagé.
      "Cache-Control": `private, max-age=${opts.cacheSecondes ?? 3600}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${affichable ? "inline" : "attachment"}; filename="${nom}"`,
    },
  });
}
