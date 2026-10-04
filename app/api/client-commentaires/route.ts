import { NextRequest, NextResponse, after } from "next/server";
import { listerCommentairesClient, ajouterCommentaireClient, supprimerCommentaireClient, getClient } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { sendEmail, emailEstConfigure, type EmailResult } from "@/lib/email";
import { envoyerPushUtilisateur, pushEstConfigure } from "@/lib/push";
import { idEntier, lireCorps, texte } from "@/lib/requete";

const COURRIELS: Record<string, string | undefined> = {
  Gabriel: process.env.GABRIEL_EMAIL,
  Francis: process.env.FRANCIS_EMAIL,
};

export async function GET(req: NextRequest) {
  const cid = idEntier(req.nextUrl.searchParams.get("client_id"));
  if (!cid) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
  return NextResponse.json(await listerCommentairesClient(cid));
}

export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const clientId = idEntier(b.client_id);
  const texteCommentaire = texte(b.texte, 5000);
  if (!clientId || !texteCommentaire) return NextResponse.json({ error: "client_id et texte requis" }, { status: 400 });
  // UN seul getClient : il sert à refuser un commentaire sur une fiche qui n'existe pas
  // (il n'apparaîtrait nulle part) ET au texte des notifications plus bas.
  const client = await getClient(clientId);
  if (!client) return NextResponse.json({ error: "client introuvable" }, { status: 404 });
  const auteur = await utilisateurActif(req);
  // Parser les @mentions
  const mentions = Array.from(new Set((texteCommentaire.match(/@(Gabriel|Francis)/gi) || []).map((m) => m.slice(1).replace(/^./, (c) => c.toUpperCase()))));
  const id = await ajouterCommentaireClient({ client_id: clientId, auteur, texte: texteCommentaire, mentions });

  // Notifications @mention (push + courriel), APRÈS la réponse via `after()` : sur Vercel,
  // une promesse simplement détachée pouvait être tuée avec la fonction dès la réponse
  // rendue — la mention n'arrivait jamais, sans trace. Les échecs vont au journal serveur.
  if (mentions.length) {
    after(async () => {
      // Push PWA (immédiat, sur tous les appareils abonnés du destinataire)
      if (pushEstConfigure()) {
        for (const u of mentions) {
          if (u === auteur) continue;
          await envoyerPushUtilisateur(u, {
            title: `💬 ${auteur || "Quelqu'un"} t'a mentionné`,
            body: `${client.nom || "Client"} : ${texteCommentaire.slice(0, 100)}`,
            url: `/clients/${clientId}`,
            tag: `mention-${clientId}`,
          }).catch((e: any) => console.error(`[/api/client-commentaires] push à ${u} non envoyé :`, e?.message || e));
        }
      }
      if (!emailEstConfigure()) return;
      for (const u of mentions) {
        if (u === auteur) continue;
        const dest = COURRIELS[u];
        if (!dest) continue;
        const sujet = `[Pipeline Viking] @${auteur || "Quelqu'un"} t'a mentionné — ${client.nom || "client"}`;
        const corps = `${auteur || "Un collègue"} t'a mentionné dans le pipeline CRM.

Client : ${client.nom || "—"}${client.adresse ? ` (${client.adresse})` : ""}

« ${texteCommentaire} »

Ouvre l'app pour répondre :
https://app.revetementviking.com/clients

— Revêtement Viking Inc.`;
        const r: EmailResult = await sendEmail({ to: dest, subject: sujet, text: corps })
          .catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
        if (!r.ok) console.error(`[/api/client-commentaires] courriel de mention à ${u} non envoyé :`, r.error || r.raison);
      }
    });
  }

  return NextResponse.json({ ok: true, id, mentions });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  if (!(await supprimerCommentaireClient(id))) return NextResponse.json({ error: "commentaire introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
