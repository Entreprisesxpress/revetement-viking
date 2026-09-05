// Documents d'un chantier : permis, plans, garanties, fiches techniques, rapports.
// Distinct des photos de chantier, du contrat signé et de la facture finale, qui ont
// chacun leur emplacement dédié.
import { NextRequest, NextResponse } from "next/server";
import { listerFichiersProjet, ajouterFichierProjet, modifierFichierProjet, supprimerFichierProjet, projetReferenceValide } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { journaliser } from "@/lib/audit";
import { LIMITE_ENCODEE_OCTETS, LIMITE_FICHIER_TEXTE } from "@/lib/limites-fichiers";

export const dynamic = "force-dynamic";

// Plafond sur la chaîne encodée, SOUS les 4,5 Mo de la plateforme (lib/limites-fichiers).
// L'ancien seuil (5,5 Mo) était au-dessus : Vercel répondait 413 avant nous, et ce
// message ne sortait jamais.
const TAILLE_MAX = LIMITE_ENCODEE_OCTETS;

export async function GET(req: NextRequest) {
  const pid = req.nextUrl.searchParams.get("projet_id");
  if (!pid) return NextResponse.json({ error: "projet_id requis" }, { status: 400 });
  return NextResponse.json(await listerFichiersProjet(+pid), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.projet_id || !body?.data) {
      return NextResponse.json({ error: "projet_id et data requis" }, { status: 400 });
    }
    const m = /^data:([^;]+);base64,/.exec(String(body.data));
    if (!m) return NextResponse.json({ error: "fichier illisible (dataURL attendue)" }, { status: 400 });
    if (String(body.data).length > TAILLE_MAX) {
      return NextResponse.json({ error: `document trop lourd (max ${LIMITE_FICHIER_TEXTE}) — compresse le PDF ou réduis la photo` }, { status: 400 });
    }
    // Un document rattaché à un projet qui n'existe pas serait introuvable : personne ne
    // pourrait plus jamais l'ouvrir, alors qu'il occuperait la place en base.
    if (!(await projetReferenceValide(body.projet_id))) {
      return NextResponse.json({ error: "projet introuvable" }, { status: 400 });
    }
    const user = await utilisateurActif(req);
    const id = await ajouterFichierProjet({
      projet_id: +body.projet_id,
      nom: String(body.nom || "document").slice(0, 200),
      type: body.type || m[1] || "application/octet-stream",
      data: String(body.data),
      taille: body.taille,
      categorie: body.categorie || null,
      description: body.description || null,
      ajoute_par: user || undefined,
    } as any);
    journaliser("projet.document_ajoute", {
      ref_type: "projet", ref_id: body.projet_id, utilisateur: user || undefined,
      description: `${body.categorie ? `[${body.categorie}] ` : ""}${body.nom || "document"}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("[/api/projet-fichiers POST]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}

/** Renommer, reclasser ou décrire un document déjà déposé — sans avoir à le redéposer. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const ok = await modifierFichierProjet(+body.id, {
    ...(body.nom !== undefined ? { nom: body.nom } : {}),
    ...(body.categorie !== undefined ? { categorie: body.categorie } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
  });
  if (!ok) return NextResponse.json({ error: "document introuvable ou nom vide" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const user = await utilisateurActif(req);
  await supprimerFichierProjet(+id);
  journaliser("projet.document_supprime", { ref_type: "projet", ref_id: id, utilisateur: user || undefined, description: `Suppression document #${id}` }).catch(() => {});
  return NextResponse.json({ ok: true });
}
