// File d'attente offline minimaliste : si un POST critique (heures / dépenses)
// échoue par perte de réseau, on stocke dans localStorage et on retente au retour.

const CLE = "vk-file-offline-v1";
const MAX_ESSAIS = 10;

interface Action { url: string; body: any; method: string; id: string; date: string; essais?: number }

function lire(): Action[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function ecrire(a: Action[]) {
  try { localStorage.setItem(CLE, JSON.stringify(a)); } catch { /* quota plein : on ne casse pas la saisie */ }
}

/** Envoie un POST normalement, ou file en cas d'erreur réseau.
 *  `offline: true` veut dire « pas encore enregistré au serveur » — l'appelant DOIT
 *  le dire à l'utilisateur autrement il croit que c'est parti. */
export async function postOuFile(url: string, body: any, method: string = "POST"): Promise<{ ok: boolean; offline?: boolean; data?: any; erreur?: string }> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) return { ok: false, data, erreur: data?.error || `HTTP ${r.status}` };
    return { ok: true, data };
  } catch {
    // hors-ligne ou serveur injoignable
    const f = lire();
    f.push({ url, body, method, id: Math.random().toString(36).slice(2), date: new Date().toISOString(), essais: 0 });
    ecrire(f);
    return { ok: true, offline: true };
  }
}

export function nbActionsEnAttente(): number { return lire().length; }

// Verrou : sans lui, deux passages simultanés (événement « online » + minuterie, ou
// plusieurs moniteurs) lisent la MÊME file et postent chaque saisie deux fois.
let videEnCours = false;

/** Tente d'envoyer toutes les actions en file. À appeler au retour réseau. */
export async function viderFile(): Promise<{ envoyees: number; restantes: number; abandonnees: number }> {
  if (videEnCours) return { envoyees: 0, restantes: nbActionsEnAttente(), abandonnees: 0 };
  const f = lire();
  if (f.length === 0) return { envoyees: 0, restantes: 0, abandonnees: 0 };
  videEnCours = true;
  // On retire tout de suite ce qu'on s'apprête à envoyer : si l'onglet est fermé en
  // cours de route, on préfère perdre une saisie que la poster en double.
  ecrire([]);
  const restantes: Action[] = [];
  let envoyees = 0, abandonnees = 0;
  try {
    for (const a of f) {
      try {
        const r = await fetch(a.url, { method: a.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(a.body) });
        if (r.ok) { envoyees++; continue; }
        // Un refus du serveur (400 validation, 404, 409 conflit) ne passera JAMAIS en
        // rejouant : avant, il était remis en file et retenté toutes les 60 s pour
        // l'éternité. Seuls les 401/408/429/5xx valent d'être réessayés.
        const rejouable = r.status === 401 || r.status === 408 || r.status === 429 || r.status >= 500;
        if (!rejouable) { abandonnees++; continue; }
        const essais = (a.essais || 0) + 1;
        if (essais >= MAX_ESSAIS) { abandonnees++; continue; }
        restantes.push({ ...a, essais });
      } catch {
        const essais = (a.essais || 0) + 1;
        if (essais >= MAX_ESSAIS) { abandonnees++; continue; }
        restantes.push({ ...a, essais });
      }
    }
  } finally {
    // On réécrit ce qui reste EN PLUS de ce qui a pu être filé pendant l'envoi.
    ecrire([...lire(), ...restantes]);
    videEnCours = false;
  }
  return { envoyees, restantes: restantes.length, abandonnees };
}

// Un seul moniteur par onglet, quoi qu'il arrive. `Navigation` n'est pas dans le layout :
// elle se remonte à CHAQUE navigation, et chaque montage posait un écouteur « online » et
// un setInterval de plus, jamais nettoyés. Au bout de dix pages visitées, dix moniteurs
// se déclenchaient ensemble au retour du réseau.
let moniteurActif = false;

/** Démarre le moniteur réseau. Retourne une fonction d'arrêt (à appeler au démontage). */
export function activerMoniteurOffline(onSync?: (info: { envoyees: number; restantes: number; abandonnees: number }) => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (moniteurActif) return () => {};
  moniteurActif = true;

  const tenter = async () => {
    if (!navigator.onLine) return;
    if (nbActionsEnAttente() === 0) return;
    const r = await viderFile();
    if ((r.envoyees > 0 || r.abandonnees > 0) && onSync) onSync(r);
  };
  window.addEventListener("online", tenter);
  const timer = setInterval(tenter, 60000);
  return () => {
    window.removeEventListener("online", tenter);
    clearInterval(timer);
    moniteurActif = false;
  };
}
