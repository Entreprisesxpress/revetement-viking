// Repli « sans serveur courriel » pour envoyer un contrat au client — logique PURE.
//
// Quand /api/contrats-pipeline/[token]/envoyer répond `{ ok:false, raison:"email_non_configure" }`
// (RESEND non configuré), l'écran propose de VRAIS liens que l'utilisateur touche lui-même :
// un `window.location.href = "mailto:…"` posé après un `await` n'est plus dans le geste de
// l'utilisateur et se fait bloquer sur téléphone (même motif que lib/demande-avis.ts).

import { VIKING_EMAIL } from "./demande-avis";

export const RAISON_EMAIL_NON_CONFIGURE = "email_non_configure";

/** Vrai quand la réponse de l'API (corps JSON) dit que le serveur n'a pas de courriel
 *  configuré — le `{ ok:false }` arrive en 200, donc `envoyer()` le range dans `data`. */
export function estEmailNonConfigure(data: any): boolean {
  return !!data && typeof data === "object" && data.ok === false && data.raison === RAISON_EMAIL_NON_CONFIGURE;
}

export function sujetContrat(numero: string): string {
  return `Contrat à signer — Revêtement Viking Inc. (${numero})`;
}

export function messageContrat(nomClient: string, lien: string): string {
  return `Bonjour ${String(nomClient || "").trim()},

Voici le lien sécurisé pour consulter et signer votre contrat de rénovation :

${lien}

Prenez le temps de le lire avant de signer. Une copie signée vous sera renvoyée après votre signature.

Cordialement,
Revêtement Viking Inc.`;
}

/** Lien mailto: — ouvre l'app courriel de l'appareil avec le message prérempli. */
export function urlMailtoContrat(courriel: string, numero: string, nomClient: string, lien: string): string {
  return `mailto:${encodeURIComponent(courriel)}?subject=${encodeURIComponent(sujetContrat(numero))}&body=${encodeURIComponent(messageContrat(nomClient, lien))}`;
}

/** Composition Gmail web (ordinateur), compte Viking présélectionné. */
export function urlGmailContrat(courriel: string, numero: string, nomClient: string, lien: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(VIKING_EMAIL)}&view=cm&fs=1&to=${encodeURIComponent(courriel)}&su=${encodeURIComponent(sujetContrat(numero))}&body=${encodeURIComponent(messageContrat(nomClient, lien))}`;
}
