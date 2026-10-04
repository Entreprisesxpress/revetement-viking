// Documents d'un chantier : permis, plans, garanties, fiches techniques, rapports.
// Distinct des photos de chantier, du contrat signé et de la facture finale, qui ont
// chacun leur emplacement dédié.
import { NextRequest, NextResponse, after } from "next/server";
import { listerFichiersProjet, ajouterFichierProjet, modifierFichierProjet, supprimerFichierProjet, projetReferenceValide } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { journaliser } from "@/lib/audit";
import { LIMITE_ENCODEE_OCTETS, LIMITE_FICHIER_TEXTE } from "@/lib/limites-fichiers";
import { idEntier, lireCorps, texte } from "@/lib/requete";

export const dynamic = "force-dynamic";

// Plafond sur la chaîne encodée, SOUS les 4,5 Mo de la plateforme (lib/limites-fichiers).
// L'ancien seuil (5,5 Mo) était au-dessus : Vercel répondait 413 avant nous, et ce
// message ne sortait jamais.
const TAILLE_MAX = LIMITE_ENCODEE_OCTETS;

export async function GET(req: NextRequest) {
  const pid = idEntier(req.nextUrl.searchParams.get("projet_id"));
  if (!pid) return NextResponse.json({ error: "projet_id invalide" }, { status: 400 });
  return NextResponse.json(await listerFichiersProjet(pid), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const projetId = idEntier(body.projet_id);
    if (!projetId || !body.data) {
      return NextResponse.json({ error: "projet_id et data requis" }, { status: 400 });
    }
    const m = /^data:([^;]+);base64,/.exec(String(body.data));
    if (!m) return NextResponse.json({ error: "fichier illisible (dataURL attendue)" }, { status: 400 });
    if (String(body.data).length > TAILLE_MAX) {
      return NextResponse.json({ error: `document trop lourd (max ${LIMITE_FICHIER_TEXTE}) — compresse le PDF ou réduis la photo` }, { status: 400 });
    }
    // Un document rattaché à un projet qui n'existe pas serait introuvable : personne ne
    // pourrait plus jamais l'ouvrir, alors qu'il occuperait la place en base.
    if (!(await projetReferenceValide(projetId))) {
      return NextResponse.json({ error: "projet introuvable" }, { status: 400 });
    }
    const user = await utilisateurActif(req);
    const nom = texte(body.nom, 200) || "document";
    const id = await ajouterFichierProjet({
      projet_id: projetId,
      nom,
      type: body.type || m[1] || "application/octet-stream",
      data: String(body.data),
      taille: body.taille,
      categorie: texte(body.categorie, 100) || null,
      description: texte(body.description, 1000) || null,
      ajoute_par: user || undefined,
    } as any);
    after(() => journaliser("projet.document_ajoute", {
      ref_type: "projet", ref_id: projetId, utilisateur: user || undefined,
      description: `${body.categorie ? `[${body.categorie}] ` : ""}${nom}`,
    }));
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("[/api/projet-fichiers POST]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}

/** Renommer, reclasser ou décrire un document déjà déposé — sans avoir à le redéposer. */
export async function PATCH(req: NextRequest) {
  const body = await lireCorps(req);
  if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(body.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const ok = await modifierFichierProjet(id, {
    ...(body.nom !== undefined ? { nom: body.nom } : {}),
    ...(body.categorie !== undefined ? { categorie: texte(body.categorie, 100) } : {}),
    ...(body.description !== undefined ? { description: texte(body.description, 1000) } : {}),
  } as any);
  if (!ok) return NextResponse.json({ error: "document introuvable ou nom vide" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const user = await utilisateurActif(req);
  if (!(await supprimerFichierProjet(id))) return NextResponse.json({ error: "document introuvable" }, { status: 404 });
  after(() => journaliser("projet.document_supprime", { ref_type: "projet", ref_id: id, utilisateur: user || undefined, description: `Suppression document #${id}` }));
  return NextResponse.json({ ok: true });
}
