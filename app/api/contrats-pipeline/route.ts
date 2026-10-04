import { NextRequest, NextResponse, after } from "next/server";
import { creerContratPipeline, listerContratsParClient, marquerContratEnvoye, supprimerContratPipeline, definirAnnexeContrat, genererNumeroContratPipeline, getContratPipelineParId, numeroContratPipelineExiste, projetDuClientParNumero } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { journaliser } from "@/lib/audit";
import { donneesTropLourdes, LIMITE_FICHIER_TEXTE } from "@/lib/limites-fichiers";
import { idEntier, lireCorps } from "@/lib/requete";

// Le contenu du contrat (data_json) est un objet de quelques Ko ; au-delà de 200 000
// caractères sérialisés, c'est un payload aberrant (413), pas un contrat.
const DATA_JSON_MAX = 200_000;

function genererToken(): string {
  // Token cryptographiquement fort (le lien de signature de contrat a une valeur juridique).
  // Math.random() est prévisible (~52 bits, énumérable) → on utilise le CSPRNG Web Crypto.
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join(""); // 48 hex, 192 bits
}

export async function GET(req: NextRequest) {
  const cid = idEntier(req.nextUrl.searchParams.get("client_id"));
  if (!cid) return NextResponse.json({ error: "client_id invalide" }, { status: 400 });
  return NextResponse.json(await listerContratsParClient(cid));
}

export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const clientId = idEntier(b.client_id);
  if (!clientId || !b.data_json || !b.pdf_brouillon) {
    return NextResponse.json({ error: "client_id, data_json, pdf_brouillon requis" }, { status: 400 });
  }
  if (typeof b.data_json !== "object" || JSON.stringify(b.data_json).length > DATA_JSON_MAX) {
    return NextResponse.json({ error: "data_json trop volumineux ou invalide", message: `Le contenu du contrat dépasse ${DATA_JSON_MAX.toLocaleString("fr-CA")} caractères : les fichiers (devis, photos) ne vont pas dans data_json — joins le devis par annexe_data.` }, { status: 413 });
  }
  // Devis joint (facultatif). 4 Mo de fichier ≈ 5,5 Mo encodés : au-delà, la requête est
  // refusée par la plateforme et l'envoi échouerait sans message clair.
  let annexe: { data: string; nom: string; type: string } | null = null;
  if (b.annexe_data) {
    const m = /^data:([^;]+);base64,/.exec(String(b.annexe_data));
    if (!m) return NextResponse.json({ error: "annexe illisible (dataURL attendue)" }, { status: 400 });
    if (donneesTropLourdes(b.annexe_data)) {
      return NextResponse.json({ error: `devis trop lourd (max ${LIMITE_FICHIER_TEXTE}) — compresse le PDF` }, { status: 400 });
    }
    annexe = { data: String(b.annexe_data), nom: String(b.annexe_nom || "devis.pdf").slice(0, 120), type: m[1] };
  }
  const user = await utilisateurActif(req);
  const token = genererToken();
  // Numéro séquentiel UNIQUE (C-AAAA-NNN, MAX+1). L'ancien « C-année-client_id » se
  // répétait d'un contrat à l'autre du même client, et la 2e signature écrasait le
  // projet de la 1re. Les contrats existants gardent leur numéro.
  // Un numéro envoyé par l'écran n'est repris QUE s'il est celui d'un projet existant de
  // CE client (contrat lié à un chantier) ; sinon il est ignoré et on génère. Avant, le
  // serveur reprenait `b.numero` tel quel — n'importe quelle chaîne devenait un numéro de
  // contrat, doublon compris. Un numéro déjà porté par un autre contrat en ligne est refusé.
  let numero = "";
  const numeroDemande = String(b.numero || "").trim();
  if (numeroDemande) {
    const projet = await projetDuClientParNumero(clientId, numeroDemande);
    if (projet) {
      if (await numeroContratPipelineExiste(projet.numero)) {
        return NextResponse.json({ error: "numéro déjà pris", message: `Un contrat en ligne porte déjà le numéro ${projet.numero}. Supprime le brouillon existant ou laisse le numéro vide.` }, { status: 409 });
      }
      numero = projet.numero;
    }
  }
  if (!numero) numero = await genererNumeroContratPipeline();

  // Le brouillon est régénéré ICI, côté serveur, avec le numéro — que le navigateur ne
  // connaît pas encore au moment où il compose son PDF. Sans ça, le contrat envoyé au
  // client portait « CONTRAT N° — » sur la couverture et un en-tête vide sur chaque page
  // (constaté en extrayant le texte du PDF). C'est aussi la même règle que pour le PDF
  // signé : la pièce vient du data_json autoritaire, jamais du payload du navigateur.
  let pdfBrouillon: string = b.pdf_brouillon;
  try {
    const { genererContratBlob } = await import("@/lib/pdf-contrat");
    const blob = await genererContratBlob({ ...(b.data_json || {}), numero });
    pdfBrouillon = `data:application/pdf;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
  } catch (e) {
    // Repli sur le PDF du navigateur : mieux vaut un contrat sans numéro que pas de contrat.
    console.error("[contrats-pipeline] régénération du brouillon échouée, repli navigateur", e);
  }
  const id = await creerContratPipeline({
    client_id: clientId, numero, token,
    data_json: b.data_json, pdf_brouillon: pdfBrouillon,
    cree_par: user || undefined,
    annexe_data: annexe?.data || null, annexe_nom: annexe?.nom || null, annexe_type: annexe?.type || null,
  });
  after(() => journaliser("contrat_pipeline.cree", { ref_type: "contrat_pipeline", ref_id: id, utilisateur: user || undefined, description: `${numero} · client ${clientId}`, apres: { numero, client_id: clientId, annexe: !!annexe } }));
  return NextResponse.json({ ok: true, id, token, numero });
}

export async function PATCH(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });

  // Joindre / remplacer / retirer le devis d'un contrat déjà créé, sans avoir à le refaire.
  if (b.action === "annexe") {
    let a: { data: string; nom: string; type: string } | null = null;
    if (b.annexe_data) {
      const m = /^data:([^;]+);base64,/.exec(String(b.annexe_data));
      if (!m) return NextResponse.json({ error: "annexe illisible (dataURL attendue)" }, { status: 400 });
      if (donneesTropLourdes(b.annexe_data)) {
        return NextResponse.json({ error: `devis trop lourd (max ${LIMITE_FICHIER_TEXTE}) — compresse le PDF` }, { status: 400 });
      }
      a = { data: String(b.annexe_data), nom: String(b.annexe_nom || "devis.pdf").slice(0, 120), type: m[1] };
    }
    const res = await definirAnnexeContrat(id, a);
    if (!res.ok) return NextResponse.json({ error: "refusé", message: res.raison }, { status: res.raison?.includes("introuvable") ? 404 : 409 });
    return NextResponse.json({ ok: true });
  }

  if (b.action !== "envoye") return NextResponse.json({ error: "action inconnue (envoye | annexe)" }, { status: 400 });
  if (!(await getContratPipelineParId(id))) return NextResponse.json({ error: "contrat introuvable" }, { status: 404 });
  await marquerContratEnvoye(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const user = await utilisateurActif(req);
  const avant = await getContratPipelineParId(id); // colonnes sans blobs
  const res = await supprimerContratPipeline(id);
  if (!res.ok) return NextResponse.json({ error: res.raison }, { status: res.raison?.includes("introuvable") ? 404 : 409 });
  after(() => journaliser("contrat_pipeline.supprime", { ref_type: "contrat_pipeline", ref_id: id, utilisateur: user || undefined, description: avant ? `${avant.numero} · ${avant.statut}` : `Contrat #${id}`, avant: avant ? { numero: avant.numero, client_id: avant.client_id, statut: avant.statut, date_envoye: avant.date_envoye } : null }));
  return NextResponse.json({ ok: true });
}
