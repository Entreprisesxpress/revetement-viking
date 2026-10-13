// Gestion des comptes par FRANCIS (Paramètres → Comptes) : voir l'état des mots de passe,
// envoyer (ou copier) un lien de réinitialisation, ou poser directement un nouveau mot de
// passe pour quelqu'un.
import { NextRequest, NextResponse } from "next/server";
import { utilisateurActif } from "@/lib/authUser";
import { UTILISATEURS, motDePasse } from "@/lib/session";
import { listerComptes, courrielUtilisateur, definirJetonReinit, definirMotDePasse } from "@/lib/db";
import { genererJetonReinit, empreinteJeton, JETON_REINIT_VALIDITE_MS, hacherMotDePasse, motDePasseInvalide } from "@/lib/mdp";
import { sendEmail, emailEstConfigure, masquerCourriel } from "@/lib/email";
import { journaliser } from "@/lib/audit";
import { ipClient } from "@/lib/ip";
import { publicOrigin } from "@/lib/origin";
import { lireCorps } from "@/lib/requete";

export const dynamic = "force-dynamic";

/** Qui peut gérer les comptes des autres. */
export const ADMINS_COMPTES = ["Francis"] as const;

async function admin(req: NextRequest): Promise<string | NextResponse> {
  const user = await utilisateurActif(req);
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  if (!(ADMINS_COMPTES as readonly string[]).includes(user)) return NextResponse.json({ error: "réservé à Francis" }, { status: 403 });
  return user;
}

export async function GET(req: NextRequest) {
  const a = await admin(req);
  if (typeof a !== "string") return a;
  const comptes = await listerComptes();
  const liste = await Promise.all(UTILISATEURS.map(async (u) => {
    const c = comptes.find((x) => x.username === u);
    return {
      username: u,
      mdp_app: !!c?.mdp_hash,                       // mot de passe défini dans l'app
      mdp_env: !!motDePasse(u),                     // mot de passe d'amorçage (Vercel) présent
      mdp_modifie_le: c?.mdp_modifie_le || null,
      mdp_modifie_par: c?.mdp_modifie_par || null,
      lien_en_cours: !!(c?.reinit_expire_le && c.reinit_expire_le > new Date().toISOString()),
      courriel: await courrielUtilisateur(u),
    };
  }));
  return NextResponse.json({ comptes: liste, courriel_configure: emailEstConfigure() });
}

export async function POST(req: NextRequest) {
  const a = await admin(req);
  if (typeof a !== "string") return a;
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const cible = String(b.user || "");
  if (!UTILISATEURS.includes(cible as any)) return NextResponse.json({ error: "utilisateur inconnu" }, { status: 400 });
  const ip = ipClient(req);

  if (b.action === "lien") {
    const jeton = genererJetonReinit();
    const expire = new Date(Date.now() + JETON_REINIT_VALIDITE_MS).toISOString();
    await definirJetonReinit(cible, empreinteJeton(jeton), expire);
    const url = `${publicOrigin(req)}/reinitialiser?jeton=${jeton}`;
    await journaliser("auth.lien_reinit", { description: `Lien de réinitialisation émis pour ${cible} par ${a}`, utilisateur: a, ip });
    // Courriel si possible ; dans tous les cas le lien est renvoyé pour le remettre à la
    // main (texto, en personne) — c'est la voie de secours quand le courriel n'est pas là.
    const courriel = await courrielUtilisateur(cible);
    let envoye = false;
    let detail = "";
    if (courriel && emailEstConfigure()) {
      const r = await sendEmail({
        to: courriel,
        subject: "[Revêtement Viking] Lien pour choisir un nouveau mot de passe",
        text: `Bonjour ${cible},\n\n${a} t'a envoyé un lien pour choisir un nouveau mot de passe de l'app Revêtement Viking (valide 2 heures) :\n${url}\n\n— Revêtement Viking Inc.`,
      });
      envoye = r.ok;
      detail = r.ok ? `Courriel envoyé à ${masquerCourriel(courriel)}.` : `Courriel non envoyé (${r.error || r.raison || "erreur"}).`;
    } else {
      detail = courriel ? "Envoi de courriel non configuré sur le serveur." : `Aucun courriel enregistré pour ${cible}.`;
    }
    return NextResponse.json({ ok: true, url, envoye, detail, expire });
  }

  if (b.action === "mdp") {
    const nouveau = String(b.nouveau || "");
    const invalide = motDePasseInvalide(nouveau);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    await definirMotDePasse(cible, hacherMotDePasse(nouveau), a);
    await journaliser("auth.mdp_change", { description: `Mot de passe de ${cible} changé par ${a}`, utilisateur: a, ip });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action inconnue (lien | mdp)" }, { status: 400 });
}
