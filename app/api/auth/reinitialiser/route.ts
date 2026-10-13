// Réinitialisation par jeton (PUBLIC) : le lien reçu par courriel, ou remis par Francis.
import { NextRequest, NextResponse } from "next/server";
import { compteParJetonReinit, definirMotDePasse } from "@/lib/db";
import { empreinteJeton, hacherMotDePasse, motDePasseInvalide } from "@/lib/mdp";
import { rateLimitDepasse } from "@/lib/rateLimit";
import { journaliser } from "@/lib/audit";
import { ipClient } from "@/lib/ip";

export const dynamic = "force-dynamic";

/** GET ?jeton= : dit si le jeton est encore valide (pour afficher le formulaire). */
export async function GET(req: NextRequest) {
  const jeton = req.nextUrl.searchParams.get("jeton") || "";
  if (!/^[0-9a-f]{48}$/.test(jeton)) return NextResponse.json({ valide: false });
  const c = await compteParJetonReinit(empreinteJeton(jeton));
  return NextResponse.json({ valide: !!c, user: c?.username || null });
}

export async function POST(req: NextRequest) {
  const ip = ipClient(req);
  if (await rateLimitDepasse("auth.mdp_reinit", ip, 10, 60)) {
    return NextResponse.json({ error: "Trop d'essais. Réessaie dans une heure." }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const jeton = String(b?.jeton || "");
  const nouveau = String(b?.nouveau || "");
  if (!/^[0-9a-f]{48}$/.test(jeton)) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  const invalide = motDePasseInvalide(nouveau);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  const c = await compteParJetonReinit(empreinteJeton(jeton));
  if (!c) {
    await journaliser("auth.mdp_reinit", { description: "Jeton de réinitialisation invalide ou expiré", ip });
    return NextResponse.json({ error: "Ce lien est invalide ou expiré (il vaut 2 heures). Demande-en un nouveau." }, { status: 400 });
  }
  await definirMotDePasse(c.username, hacherMotDePasse(nouveau), `lien de réinitialisation`);
  await journaliser("auth.mdp_reinit", { description: `${c.username} a réinitialisé son mot de passe par lien`, utilisateur: c.username, ip });
  return NextResponse.json({ ok: true, user: c.username });
}
