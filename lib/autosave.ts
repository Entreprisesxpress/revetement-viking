// Autosave dans localStorage - récupération auto au prochain chargement

const KEY = "soumission-xpress-draft";

export interface BrouillonAuto {
  timestamp: number;
  numero: string;
  client: any;
  lignes: any[];
  fraisActifs: any[];
  fraisGestion: number;
  appliquerTaxes: boolean;
  hoverExtraction?: any;
}

export function sauvegarderBrouillon(data: Omit<BrouillonAuto, "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {}
}

export function chargerBrouillon(): BrouillonAuto | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function effacerBrouillon() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
