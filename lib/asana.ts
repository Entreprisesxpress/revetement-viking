// Client minimaliste pour l'API Asana
// Utilise un Personal Access Token (ASANA_PAT)
// Doc: https://developers.asana.com/reference/rest-api-reference

const BASE = "https://app.asana.com/api/1.0";
const WORKSPACE_GID = "1201013936184328"; // Revêtement Viking
const PROJET_SOUMISSION_2026 = "1212058792807287";

function getToken(): string | null {
  return process.env.ASANA_PAT || null;
}

export function asanaEstConfigure(): boolean {
  return !!getToken();
}

async function asanaFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("ASANA_PAT non configuré dans les variables d'environnement Vercel");
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...opts.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Asana ${r.status}: ${txt.slice(0, 300)}`);
  }
  return await r.json();
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  completed?: boolean;
  due_on?: string | null;
  modified_at?: string;
  created_at?: string;
  assignee?: { name?: string } | null;
}

/** Lister les tâches du projet Soumission 2026 */
export async function listerTachesSoumission(projet_gid = PROJET_SOUMISSION_2026): Promise<AsanaTask[]> {
  const fields = "name,notes,completed,due_on,modified_at,created_at,assignee.name";
  const data = await asanaFetch(`/projects/${projet_gid}/tasks?opt_fields=${fields}&limit=100`);
  return data.data as AsanaTask[];
}

/** Créer une tâche dans Asana */
export async function creerTacheAsana(params: {
  name: string;
  notes?: string;
  projet_gid?: string;
}): Promise<AsanaTask> {
  const projet = params.projet_gid || PROJET_SOUMISSION_2026;
  const body = {
    data: {
      name: params.name,
      notes: params.notes || "",
      workspace: WORKSPACE_GID,
      projects: [projet],
    },
  };
  const r = await asanaFetch("/tasks", { method: "POST", body: JSON.stringify(body) });
  return r.data as AsanaTask;
}

/** Modifier une tâche Asana */
export async function modifierTacheAsana(gid: string, patch: Partial<{ name: string; notes: string; completed: boolean }>): Promise<AsanaTask> {
  const body = { data: patch };
  const r = await asanaFetch(`/tasks/${gid}`, { method: "PUT", body: JSON.stringify(body) });
  return r.data as AsanaTask;
}

/** Supprimer (archiver) une tâche Asana */
export async function supprimerTacheAsana(gid: string): Promise<void> {
  await asanaFetch(`/tasks/${gid}`, { method: "DELETE" });
}

/** Construire les notes Asana à partir d'un client CRM */
export function clientVersNotesAsana(client: any): string {
  const lignes: string[] = [];
  if (client.nom) lignes.push(`Client: ${client.nom}`);
  if (client.adresse) lignes.push(`Adresse: ${client.adresse}`);
  if (client.telephone) lignes.push(`Téléphone: ${client.telephone}`);
  if (client.courriel) lignes.push(`Courriel: ${client.courriel}`);
  if (client.statut) lignes.push(`Statut: ${client.statut}`);
  if (client.source) lignes.push(`Source: ${client.source}`);
  if (client.tags) lignes.push(`Tags: ${client.tags}`);
  if (client.notes) lignes.push(`\n${client.notes}`);
  lignes.push(`\n[Synchronisé depuis Revêtement Viking App]`);
  return lignes.join("\n");
}

/** Extraire info client depuis notes Asana (best-effort) */
export function parserNotesAsana(task: AsanaTask): { nom: string; telephone?: string; courriel?: string; adresse?: string; notes?: string } {
  const n = task.notes || "";
  const tel = n.match(/(\+?\d[\d\s\-\(\)]{7,})/)?.[1];
  const mail = n.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  // Adresse : ligne contenant un chiffre + nom de rue
  let adresse = n.match(/(\d+[,\s][^\n]{5,80})/)?.[1];
  if (adresse) adresse = adresse.trim().split("\n")[0];
  return {
    nom: task.name.split(/[-\n]/)[0].trim() || task.name,
    telephone: tel?.replace(/\s+/g, " ").trim(),
    courriel: mail,
    adresse,
    notes: n.slice(0, 500),
  };
}
