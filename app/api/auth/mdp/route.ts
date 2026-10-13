// Changer SON mot de passe (Paramètres → Mot de passe) : mot de passe actuel exigé.
import { NextRequest, NextResponse } from "next/server";
import { utilisateurActif } from "@/lib/authUser";
import { getCompte, definirMotDePasse } from "@/lib/db";
import { motDePasse } from "@/lib/session";
import { hacherMotDePasse, verifierMotDePasse, motDePasseInvalide } from "@/lib/mdp";
import { timingSafeEqual } from "@/lib/rateLimit";
import { journaliser } from "@/lib/audit";
import { ipClient } from "@/lib/ip";
import { lireCorps } from "@/lib/requete";

export const dynamic = "force-dynamic";

/** Vrai si `mdp` est le mot de passe actuel de `user` : celui de l'app s'il existe,
 *  sinon celui de la variable d'environnement (mot de passe d'amorçage). */
export async function motDePasseActuelValide(user: string, mdp: string): Promise<boolean> {
  const compte = await getCompte(user).catch(() => null);
  if (compte?.mdp_hash) return verifierMotDePasse(mdp, compte.mdp_hash);
  const env = motDePasse(user);
  return !!env && timingSafeEqual(mdp, env);
}

export async function POST(req: NextRequest) {
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const actuel = String(b.actuel || "");
  const nouveau = String(b.nouveau || "");
  const invalide = motDePasseInvalide(nouveau);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  if (!(await motDePasseActuelValide(user, actuel))) {
    await journaliser("auth.login_echec", { description: `Mauvais mot de passe — ${user}`, ip: ipClient(req), utilisateur: user });
    return NextResponse.json({ error: "Le mot de passe actuel est incorrect." }, { status: 401 });
  }
  if (actuel === nouveau) return NextResponse.json({ error: "Le nouveau mot de passe doit être différent de l'actuel." }, { status: 400 });
  await definirMotDePasse(user, hacherMotDePasse(nouveau), user);
  await journaliser("auth.mdp_change", { description: `${user} a changé son mot de passe`, utilisateur: user, ip: ipClient(req) });
  return NextResponse.json({ ok: true });
}
