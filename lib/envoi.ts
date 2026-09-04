// Envoi d'écriture avec filet — remplace le motif récurrent
//   const r = await fetch(...); if ((await r.json()).ok) { toast succès; }
// qui, en cas d'échec (400 de validation, 401 session expirée, 500, réseau coupé), ne
// disait RIEN : le geste semblait réussir alors que rien n'était enregistré.

export interface ResultatEnvoi<T = any> { ok: boolean; data?: T; erreur?: string }

/** POST/PATCH/DELETE JSON. Ne lève jamais : renvoie toujours { ok, data?, erreur? }. */
export async function envoyer<T = any>(
  url: string,
  options: { methode?: string; corps?: any } = {}
): Promise<ResultatEnvoi<T>> {
  const { methode = "POST", corps } = options;
  try {
    const r = await fetch(url, {
      method: methode,
      ...(corps !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) } : {}),
    });
    // Une réponse d'erreur n'est pas toujours du JSON (page 401/413 de la plateforme) :
    // on lit d'abord en texte pour ne jamais lever sur un « Unexpected token ».
    const txt = await r.text();
    let data: any = undefined;
    try { data = txt ? JSON.parse(txt) : undefined; } catch { /* réponse non-JSON */ }
    if (!r.ok) {
      return { ok: false, erreur: data?.error || (r.status === 401 ? "session expirée — reconnecte-toi" : `erreur ${r.status}`) };
    }
    if (data && data.ok === false) return { ok: false, erreur: data.error || "refusé par le serveur" };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, erreur: e?.message === "Failed to fetch" ? "réseau indisponible" : (e?.message || "erreur réseau") };
  }
}

/**
 * Écriture avec signalement automatique de l'échec.
 *
 * Pour le motif « feu et oublie » : `await fetch(url, { method, body }); charger();`
 * qui, en cas de 401 (session expirée), de 400 (refus de validation) ou de réseau
 * coupé, rafraîchissait l'écran comme si de rien n'était — l'utilisateur voyait sa
 * modification disparaître au rechargement sans jamais savoir pourquoi. Trouvé à
 * 64 endroits d'un coup ; trois avaient déjà été attrapés un par un en direct.
 *
 * Retourne `true` si l'écriture a réussi. Sinon, signale l'erreur (toast, ou alert
 * sans fournisseur) et retourne `false` : l'appelant fait `if (!(await ecrire(…))) return;`
 * et ne rafraîchit ni ne ferme rien sur un échec.
 */
export async function ecrire(url: string, methode: string, corps?: any, contexte?: string): Promise<boolean> {
  const r = await envoyer(url, { methode, corps });
  if (r.ok) return true;
  const { signaler } = await import("./toast-bus");
  signaler(`${contexte || "Enregistrement"} refusé : ${r.erreur}`, "error");
  return false;
}

// Implémentation unique et testée dans lib/calculs.ts (gère « 5 000,50 $ » : virgule
// décimale, espaces de milliers, symbole). Ré-exportée ici pour les écrans.
export { nombreSaisi } from "@/lib/calculs";
