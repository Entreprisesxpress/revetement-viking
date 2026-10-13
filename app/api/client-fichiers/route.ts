import { NextRequest, NextResponse, after } from "next/server";
import { listerFichiersClient, ajouterFichierClient, supprimerFichierClient, getFichierClient, getClient } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, texte } from "@/lib/requete";
import { donneesTropLourdes, LIMITE_FICHIER_TEXTE } from "@/lib/limites-fichiers";
import { journaliser } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const cid = idEntier(req.nextUrl.searchParams.get("client_id"));
  if (!cid) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
  return NextResponse.json(await listerFichiersClient(cid));
}

// Mêmes gardes que les documents de chantier (projet-fichiers) : avant, TOUT était accepté
// — « bonjour » en guise de fichier (ok:true, puis 500 « Invalid data » à la lecture), un
// client inexistant (fichier orphelin invisible), aucun plafond de taille.
export async function POST(req: NextRequest) {
  const body = await lireCorps(req);
  if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const clientId = idEntier(body.client_id);
  if (!clientId || !body.data) return NextResponse.json({ error: "client_id et data requis" }, { status: 400 });
  const m = typeof body.data === "string" ? /^data:([^;]+);base64,/.exec(body.data) : null;
  if (!m) return NextResponse.json({ error: "data doit être un fichier encodé (data URL base64)" }, { status: 400 });
  if (donneesTropLourdes(body.data)) {
    return NextResponse.json({ error: `fichier trop lourd (max ${LIMITE_FICHIER_TEXTE}) — compresse-le avant l'envoi` }, { status: 413 });
  }
  if (!(await getClient(clientId))) return NextResponse.json({ error: "client introuvable" }, { status: 400 });
  const user = await utilisateurActif(req);
  const nom = texte(body.nom, 200) || "fichier";
  const id = await ajouterFichierClient({
    client_id: clientId,
    nom,
    type: m[1].toLowerCase(),
    data: String(body.data),
    taille: Number.isFinite(Number(body.taille)) ? Number(body.taille) : null,
    ajoute_par: user || undefined,
  } as any);
  after(() => journaliser("client.fichier_ajoute", { ref_type: "client", ref_id: clientId, utilisateur: user || undefined, description: nom }));
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const user = await utilisateurActif(req);
  // Trace AVANT l'effacement : nom, type et client — sinon le journal ne disait rien.
  const f = await getFichierClient(id);
  if (!f) return NextResponse.json({ error: "fichier introuvable" }, { status: 404 });
  if (!(await supprimerFichierClient(id))) return NextResponse.json({ error: "fichier introuvable" }, { status: 404 });
  after(() => journaliser("client.fichier_supprime", {
    ref_type: "client", ref_id: f.client_id, utilisateur: user || undefined,
    description: `Suppression du fichier « ${f.nom || `#${id}`} »`,
    avant: { id, nom: f.nom, type: f.type, taille: f.taille ?? null, client_id: f.client_id },
  }));
  return NextResponse.json({ ok: true });
}
