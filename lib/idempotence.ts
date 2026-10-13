// Idempotence des POST d'écriture (heures, dépenses, extras, photos).
//
// Contrat avec les écrans : l'écran envoie un en-tête `X-Idempotence-Cle` (chaîne de
// 1 à 64 caractères, générée une fois par formulaire soumis). Si la clé a déjà servi
// à une réponse 2xx, on renvoie la MÊME réponse (même statut, même corps) sans rien
// réexécuter : un double clic, un réessai réseau ou un onglet qui rejoue la requête
// ne crée pas deux lignes. Sans en-tête, la route se comporte comme avant.
//
// La réponse n'est gardée que si elle est 2xx : un refus (400/409) doit pouvoir être
// corrigé puis renvoyé avec la même clé. Les entrées de plus de 7 jours sont purgées
// à l'occasion (au plus une purge par heure et par instance).
import { NextRequest, NextResponse } from "next/server";
import { lireIdempotence, ecrireIdempotence, purgerIdempotence, reserverIdempotence, libererIdempotence } from "@/lib/db";

export const EN_TETE_IDEMPOTENCE = "X-Idempotence-Cle";
const LONGUEUR_MAX = 64;
const RX_CLE = /^[A-Za-z0-9._:-]{1,64}$/;

/** Clé fournie par l'écran, validée. `null` si absente ; lève si mal formée. */
export function cleIdempotence(req: { headers: { get(n: string): string | null }; nextUrl?: { pathname: string } }): string | null {
  const brute = (req.headers.get(EN_TETE_IDEMPOTENCE) || "").trim();
  if (!brute) return null;
  if (brute.length > LONGUEUR_MAX || !RX_CLE.test(brute)) {
    throw Object.assign(new Error(`${EN_TETE_IDEMPOTENCE} invalide (1 à ${LONGUEUR_MAX} caractères : lettres, chiffres, . _ : -)`), { code: "CLE_IDEMPOTENCE_INVALIDE" });
  }
  // Préfixée par le chemin : la même clé envoyée à deux routes différentes ne rejoue
  // jamais la réponse de l'autre.
  const chemin = req.nextUrl?.pathname || "";
  return `${chemin}|${brute}`;
}

let _dernierePurge = 0;
const INTERVALLE_PURGE_MS = 60 * 60 * 1000;

/** Exécute `handler` sous idempotence. Voir l'en-tête du fichier. */
export async function avecIdempotence(req: NextRequest, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  let cle: string | null;
  try {
    cle = cleIdempotence(req);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "clé d'idempotence invalide" }, { status: 400 });
  }
  if (!cle) return handler();

  const rejouer = (deja: { statut: number; corps: string }) => new NextResponse(deja.corps, {
    status: deja.statut,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Idempotence-Rejouee": "1" },
  });

  // RÉSERVATION ATOMIQUE de la clé avant d'exécuter quoi que ce soit (voir lib/db.ts).
  // Avant : lecture → handler → écriture ; entre les deux, de vrais `await` (lecture du
  // corps, session) laissaient passer dix requêtes simultanées avec la même clé → dix
  // lignes d'heures dans la paie (deux onglets qui rejouent la même file hors-ligne).
  const premiere = await reserverIdempotence(cle);
  if (!premiere) {
    // Une autre requête porte la clé : réponse déjà enregistrée → on la rejoue ; encore en
    // cours → on lui laisse jusqu'à ~3 s, puis on rejoue ou on refuse (409), jamais deux fois.
    for (let i = 0; i < 6; i++) {
      const deja = await lireIdempotence(cle);
      if (!deja) break;                         // la première a échoué et libéré la clé
      if (deja.statut > 0) return rejouer(deja);
      await new Promise((r) => setTimeout(r, 500));
    }
    const deja = await lireIdempotence(cle);
    if (deja && deja.statut > 0) return rejouer(deja);
    if (deja) return NextResponse.json({ error: "requête en cours", message: "La même saisie est déjà en train d'être enregistrée. Recharge la liste avant de réessayer." }, { status: 409 });
    // Clé libérée entre-temps : on retente une fois la réservation.
    if (!(await reserverIdempotence(cle))) {
      const d2 = await lireIdempotence(cle);
      if (d2 && d2.statut > 0) return rejouer(d2);
      return NextResponse.json({ error: "requête en cours" }, { status: 409 });
    }
  }

  let res: NextResponse;
  try {
    res = await handler();
  } catch (e) {
    await libererIdempotence(cle).catch(() => {});
    throw e;
  }
  if (res.status >= 200 && res.status < 300) {
    // Le corps est lu sur un clone : la réponse d'origine repart intacte au client.
    const corps = await res.clone().text();
    await ecrireIdempotence(cle, res.status, corps).catch((e) => console.warn("[idempotence] écriture échouée :", e?.message || e));
    if (Date.now() - _dernierePurge > INTERVALLE_PURGE_MS) {
      _dernierePurge = Date.now();
      purgerIdempotence().catch(() => {});
    }
  } else {
    // Refus (400/409…) : la clé est rendue, pour qu'une saisie corrigée puisse repartir.
    await libererIdempotence(cle).catch(() => {});
  }
  return res;
}
