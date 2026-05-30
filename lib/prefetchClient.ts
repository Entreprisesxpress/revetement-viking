// Cache mémoire client : pré-charge la fiche client (taches/commentaires/fichiers/contrats)
// au survol d'une carte CRM, pour ouverture instantanée du drawer pipeline.

type Entree = { t: number; data: any };
const cache = new Map<number, Entree>();
const enCours = new Set<number>();
const TTL = 30000;

export function prefetchClient(id: number) {
  if (!id) return;
  const e = cache.get(id);
  if (e && Date.now() - e.t < TTL) return;
  if (enCours.has(id)) return;
  enCours.add(id);
  // 4 requêtes en parallèle (chargées comme le drawer)
  Promise.all([
    fetch(`/api/client-taches?client_id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`/api/client-commentaires?client_id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`/api/client-fichiers?client_id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`/api/contrats-pipeline?client_id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ])
    .then(([taches, commentaires, fichiers, contrats]) => {
      cache.set(id, { t: Date.now(), data: { taches, commentaires, fichiers, contrats } });
    })
    .catch(() => {})
    .finally(() => enCours.delete(id));
}

export function getClientPrefetch(id: number): any | null {
  const e = cache.get(id);
  if (e && Date.now() - e.t < TTL) return e.data;
  return null;
}
