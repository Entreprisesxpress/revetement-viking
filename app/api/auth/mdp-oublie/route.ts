// « Mot de passe oublié » (page de connexion, PUBLIC) : envoie un lien de réinitialisation
// au courriel de l'usager (profil, sinon FRANCIS_EMAIL / GABRIEL_EMAIL). Limité à 5
// demandes par heure et par IP. Sans courriel configuré ou sans fournisseur de courriel,
// on le DIT : la voie de secours est Francis (Paramètres → Comptes → Envoyer un lien).
import { NextRequest, NextResponse } from "next/server";
import { UTILISATEURS } from "@/lib/session";
import { courrielUtilisateur, definirJetonReinit } from "@/lib/db";
import { genererJetonReinit, empreinteJeton, JETON_REINIT_VALIDITE_MS } from "@/lib/mdp";
import { sendEmail, emailEstConfigure, masquerCourriel } from "@/lib/email";
import { rateLimitDepasse } from "@/lib/rateLimit";
import { journaliser } from "@/lib/audit";
import { ipClient } from "@/lib/ip";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = ipClient(req);
  if (await rateLimitDepasse("auth.mdp_oublie", ip, 5, 60)) {
    return NextResponse.json({ error: "Trop de demandes. Réessaie dans une heure, ou demande un lien à Francis." }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const user = String(b?.user || "");
  if (!UTILISATEURS.includes(user as any)) return NextResponse.json({ error: "Utilisateur inconnu" }, { status: 400 });
  await journaliser("auth.mdp_oublie", { description: `Demande de réinitialisation — ${user}`, ip });
  const courriel = await courrielUtilisateur(user);
  if (!courriel) {
    return NextResponse.json({ ok: false, raison: "sans_courriel", message: `Aucun courriel n'est enregistré pour ${user}. Demande à Francis de t'envoyer un lien de réinitialisation (Paramètres → Comptes).` });
  }
  if (!emailEstConfigure()) {
    return NextResponse.json({ ok: false, raison: "email_non_configure", message: "L'envoi de courriel n'est pas configuré sur le serveur. Demande à Francis de t'envoyer un lien de réinitialisation (Paramètres → Comptes)." });
  }
  const jeton = genererJetonReinit();
  const expire = new Date(Date.now() + JETON_REINIT_VALIDITE_MS).toISOString();
  await definirJetonReinit(user, empreinteJeton(jeton), expire);
  const url = `${publicOrigin(req)}/reinitialiser?jeton=${jeton}`;
  const r = await sendEmail({
    to: courriel,
    subject: "[Revêtement Viking] Réinitialisation de ton mot de passe",
    text: `Bonjour ${user},

Quelqu'un (probablement toi) a demandé à réinitialiser ton mot de passe de l'app Revêtement Viking.

Ouvre ce lien pour en choisir un nouveau (valide 2 heures) :
${url}

Si ce n'est pas toi, ignore ce courriel : ton mot de passe reste inchangé.

— Revêtement Viking Inc.`,
  });
  if (!r.ok) {
    // Détail du fournisseur dans le journal seulement : cette route est PUBLIQUE, et le
    // message brut de Resend révélait l'adresse d'envoi et l'état du compte à n'importe qui.
    await journaliser("auth.mdp_oublie", { description: `Courriel de réinitialisation NON parti pour ${user} : ${r.error || r.raison || "erreur"}`, ip });
    return NextResponse.json({ ok: false, raison: "envoi_echoue", message: "Le courriel n'est pas parti (problème d'envoi côté serveur). Demande à Francis de t'envoyer un lien." });
  }
  return NextResponse.json({ ok: true, message: `Un lien de réinitialisation a été envoyé à ${masquerCourriel(courriel)}. Il est valide 2 heures.` });
}
