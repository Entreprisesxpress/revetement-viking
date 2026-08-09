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

// Implémentation unique et testée dans lib/calculs.ts (gère « 5 000,50 $ » : virgule
// décimale, espaces de milliers, symbole). Ré-exportée ici pour les écrans.
export { nombreSaisi } from "@/lib/calculs";
