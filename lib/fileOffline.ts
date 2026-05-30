// File d'attente offline minimaliste : si un POST critique (heures / dépenses)
// échoue par perte de réseau, on stocke dans localStorage et on retente au retour.

const CLE = "vk-file-offline-v1";

interface Action { url: string; body: any; method: string; id: string; date: string }

function lire(): Action[] {
  try { return JSON.parse(localStorage.getItem(CLE) || "[]"); } catch { return []; }
}
function ecrire(a: Action[]) { localStorage.setItem(CLE, JSON.stringify(a)); }

/** Envoie un POST normalement, ou file en cas d'erreur réseau. */
export async function postOuFile(url: string, body: any, method: string = "POST"): Promise<{ ok: boolean; offline?: boolean; data?: any }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && data.ok !== false, data };
  } catch {
    // hors-ligne ou serveur injoignable
    const f = lire();
    f.push({ url, body, method, id: Math.random().toString(36).slice(2), date: new Date().toISOString() });
    ecrire(f);
    return { ok: true, offline: true };
  }
}

export function nbActionsEnAttente(): number { return lire().length; }

/** Tente d'envoyer toutes les actions en file. À appeler au retour réseau. */
export async function viderFile(): Promise<{ envoyees: number; restantes: number }> {
  const f = lire();
  if (f.length === 0) return { envoyees: 0, restantes: 0 };
  const restantes: Action[] = [];
  let envoyees = 0;
  for (const a of f) {
    try {
      const r = await fetch(a.url, { method: a.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(a.body) });
      if (r.ok) envoyees++;
      else restantes.push(a);
    } catch { restantes.push(a); }
  }
  ecrire(restantes);
  return { envoyees, restantes: restantes.length };
}

/** Démarre le moniteur réseau (à appeler une fois au boot de l'app). */
export function activerMoniteurOffline(onSync?: (info: { envoyees: number; restantes: number }) => void) {
  if (typeof window === "undefined") return;
  const tenter = async () => {
    if (!navigator.onLine) return;
    const r = await viderFile();
    if (r.envoyees > 0 && onSync) onSync(r);
  };
  window.addEventListener("online", tenter);
  // tente aussi toutes les 60 sec si en attente
  setInterval(tenter, 60000);
}
