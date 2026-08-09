// Liens publics sécurisés pour partage de soumissions au client.
// Le lien contient numero + token HMAC → seul quelqu'un avec le lien complet
// peut voir la soumission (le numéro seul ne suffit pas).

const SECRET_FALLBACK = "viking-lien-public-v1";

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function secret(): string {
  const s = process.env.APP_PASSWORD || process.env.LIEN_PUBLIC_SECRET;
  if (s) return s;
  // En production, refuser le fallback constant (sinon tokens devinables).
  if (process.env.NODE_ENV === "production") {
    throw new Error("Secret manquant : configurer APP_PASSWORD ou LIEN_PUBLIC_SECRET pour signer les liens publics.");
  }
  return SECRET_FALLBACK; // dev local uniquement
}

export async function genererTokenSoumission(numero: string): Promise<string> {
  return await hmac(secret(), `soumission:${numero}`);
}

/** Compare deux jetons à temps constant. */
function memeJeton(attendu: string, token: string): boolean {
  if (token.length !== attendu.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function verifierTokenSoumission(numero: string, token: string): Promise<boolean> {
  // La VÉRIFICATION ne lève jamais : elle refuse. Sans secret configuré, secret() lève,
  // l'exception traversait la route et le client voyait un 500 « erreur » sur un lien
  // public — un défaut de configuration déguisé en panne serveur. Refuser est à la fois
  // plus sûr (fail-closed) et plus lisible. La GÉNÉRATION, elle, continue de lever :
  // c'est là que Francis doit voir la vraie cause quand il crée un lien.
  let attendu: string;
  try { attendu = await genererTokenSoumission(numero); }
  catch { return false; }
  return memeJeton(attendu, token);
}

// === Liens publics PROJET (mode présentation client) ===
export async function genererTokenProjet(id: number): Promise<string> {
  return await hmac(secret(), `projet:${id}`);
}
export async function verifierTokenProjet(id: number, token: string): Promise<boolean> {
  let attendu: string;
  try { attendu = await genererTokenProjet(id); }
  catch { return false; }   // même raison que ci-dessus : refuser, pas planter
  return memeJeton(attendu, token);
}
