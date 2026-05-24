// Client Google Drive minimaliste (sans dépendance googleapis)
// Auth via Service Account JWT signé en RS256
// Doc: https://developers.google.com/identity/protocols/oauth2/service-account
import crypto from "crypto";

const SCOPES = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

interface SAJson {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let _cachedToken: { token: string; expires: number } | null = null;

function getSA(): SAJson | null {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SAJson;
  } catch {
    return null;
  }
}

function getFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID || null;
}

export function driveEstConfigure(): boolean {
  return !!(getSA() && getFolderId());
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  if (_cachedToken && _cachedToken.expires > Date.now() + 60_000) return _cachedToken.token;
  const sa = getSA();
  if (!sa) throw new Error("GOOGLE_SA_JSON non configuré");
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPES,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const toSign = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(toSign);
  const signature = base64UrlEncode(signer.sign(sa.private_key));
  const jwt = `${toSign}.${signature}`;

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`Token error ${r.status}: ${await r.text()}`);
  const d = await r.json();
  _cachedToken = { token: d.access_token, expires: Date.now() + (d.expires_in * 1000) };
  return d.access_token;
}

async function driveFetch(path: string, opts: RequestInit = {}, baseUrl: string = DRIVE_API): Promise<any> {
  const token = await getAccessToken();
  const r = await fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Drive ${r.status}: ${txt.slice(0, 500)}`);
  }
  return await r.json();
}

/** Cherche un sous-dossier par nom dans le dossier racine, ou le crée */
export async function trouverOuCreerSousDossier(nom: string, parent?: string): Promise<string> {
  const parentId = parent || getFolderId();
  if (!parentId) throw new Error("Pas de dossier parent");
  const nomEscape = nom.replace(/'/g, "\\'");
  const q = `name='${nomEscape}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const r = await driveFetch(`/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (r.files && r.files.length > 0) return r.files[0].id;
  // Créer
  const c = await driveFetch("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nom,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  return c.id;
}

/** Upload un fichier base64 dans un dossier Drive. Retourne l'ID + lien. */
export async function uploaderFichier(params: {
  nom: string;
  dataUrl: string; // "data:image/jpeg;base64,...."
  dossierId?: string;
  description?: string;
}): Promise<{ id: string; webViewLink: string }> {
  const dossier = params.dossierId || getFolderId();
  if (!dossier) throw new Error("Dossier non spécifié");
  const match = params.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("dataUrl invalide");
  const mimeType = match[1];
  const buf = Buffer.from(match[2], "base64");

  const metadata = {
    name: params.nom,
    parents: [dossier],
    description: params.description || "Sauvegardé depuis Revêtement Viking App",
  };

  // Multipart upload
  const boundary = `vk-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const token = await getAccessToken();
  const r = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: body as any,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Drive upload ${r.status}: ${txt.slice(0, 500)}`);
  }
  const d = await r.json();
  return { id: d.id, webViewLink: d.webViewLink };
}

/** Test de connectivité — utile pour la page de setup */
export async function testerConnexion(): Promise<{ ok: boolean; folder?: string; email?: string; message?: string }> {
  if (!driveEstConfigure()) {
    return { ok: false, message: "GOOGLE_SA_JSON et/ou GOOGLE_DRIVE_FOLDER_ID manquants dans Vercel" };
  }
  try {
    const folderId = getFolderId()!;
    const sa = getSA()!;
    const info = await driveFetch(`/files/${folderId}?fields=id,name,webViewLink`);
    return { ok: true, folder: info.name, email: sa.client_email };
  } catch (e: any) {
    return { ok: false, email: getSA()?.client_email, message: e.message };
  }
}

/** Liste les fichiers d'un dossier (max 50) */
export async function listerDossier(dossierId?: string): Promise<any[]> {
  const id = dossierId || getFolderId();
  if (!id) return [];
  const r = await driveFetch(`/files?q='${id}' in parents and trashed=false&fields=files(id,name,mimeType,modifiedTime,webViewLink,size)&pageSize=50&orderBy=modifiedTime desc`);
  return r.files || [];
}
