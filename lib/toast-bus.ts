// Bus de notifications hors React.
//
// `useToast()` ne marche que dans un composant. Or l'échec d'une ÉCRITURE (session
// expirée, refus de validation, réseau coupé) doit être signalé partout où l'on écrit,
// y compris depuis un helper partagé qui n'a pas accès au hook. Le ToastsProvider
// s'enregistre ici au montage ; tout le reste appelle `signaler()`.
//
// Sans fournisseur monté (test, page publique sans provider) : repli sur alert(), le
// même repli que `useToast()` — mieux vaut une boîte laide qu'un échec invisible.

type TypeToast = "success" | "error" | "info" | "warning";
type FnToast = (msg: string, type?: TypeToast) => void;

let courant: FnToast | null = null;

/** Appelé par ToastsProvider au montage. Retourne la fonction pour se désinscrire. */
export function enregistrerToast(fn: FnToast): () => void {
  courant = fn;
  return () => { if (courant === fn) courant = null; };
}

export function signaler(msg: string, type: TypeToast = "error"): void {
  if (courant) { courant(msg, type); return; }
  if (typeof window !== "undefined" && typeof window.alert === "function") window.alert(msg);
}
