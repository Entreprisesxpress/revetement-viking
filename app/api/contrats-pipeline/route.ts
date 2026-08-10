import { NextRequest, NextResponse } from "next/server";
import { creerContratPipeline, listerContratsParClient, marquerContratEnvoye, supprimerContratPipeline, definirAnnexeContrat } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";

function genererToken(): string {
  // Token cryptographiquement fort (le lien de signature de contrat a une valeur juridique).
  // Math.random() est prévisible (~52 bits, énumérable) → on utilise le CSPRNG Web Crypto.
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join(""); // 48 hex, 192 bits
}

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("client_id");
  if (!cid) return NextResponse.json({ error: "client_id requis" }, { status: 400 });
  return NextResponse.json(await listerContratsParClient(+cid));
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.client_id || !b.data_json || !b.pdf_brouillon) {
    return NextResponse.json({ error: "client_id, data_json, pdf_brouillon requis" }, { status: 400 });
  }
  // Devis joint (facultatif). 4 Mo de fichier ≈ 5,5 Mo encodés : au-delà, la requête est
  // refusée par la plateforme et l'envoi échouerait sans message clair.
  let annexe: { data: string; nom: string; type: string } | null = null;
  if (b.annexe_data) {
    const m = /^data:([^;]+);base64,/.exec(String(b.annexe_data));
    if (!m) return NextResponse.json({ error: "annexe illisible (dataURL attendue)" }, { status: 400 });
    if (String(b.annexe_data).length > 5.5 * 1024 * 1024) {
      return NextResponse.json({ error: "devis trop lourd (max ~4 Mo) — compresse le PDF" }, { status: 400 });
    }
    annexe = { data: String(b.annexe_data), nom: String(b.annexe_nom || "devis.pdf").slice(0, 120), type: m[1] };
  }
  const user = await utilisateurActif(req);
  const token = genererToken();
  const numero = b.numero || `C-${new Date().getFullYear()}-${String(b.client_id).padStart(3, "0")}`;
  const id = await creerContratPipeline({
    client_id: +b.client_id, numero, token,
    data_json: b.data_json, pdf_brouillon: b.pdf_brouillon,
    cree_par: user || undefined,
    annexe_data: annexe?.data || null, annexe_nom: annexe?.nom || null, annexe_type: annexe?.type || null,
  });
  return NextResponse.json({ ok: true, id, token, numero });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Joindre / remplacer / retirer le devis d'un contrat déjà créé, sans avoir à le refaire.
  if (b.action === "annexe") {
    let a: { data: string; nom: string; type: string } | null = null;
    if (b.annexe_data) {
      const m = /^data:([^;]+);base64,/.exec(String(b.annexe_data));
      if (!m) return NextResponse.json({ error: "annexe illisible (dataURL attendue)" }, { status: 400 });
      if (String(b.annexe_data).length > 5.5 * 1024 * 1024) {
        return NextResponse.json({ error: "devis trop lourd (max ~4 Mo) — compresse le PDF" }, { status: 400 });
      }
      a = { data: String(b.annexe_data), nom: String(b.annexe_nom || "devis.pdf").slice(0, 120), type: m[1] };
    }
    const res = await definirAnnexeContrat(+b.id, a);
    if (!res.ok) return NextResponse.json({ error: "refusé", message: res.raison }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (b.action !== "envoye") return NextResponse.json({ error: "action inconnue (envoye | annexe)" }, { status: 400 });
  await marquerContratEnvoye(+b.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const res = await supprimerContratPipeline(+id);
  if (!res.ok) return NextResponse.json({ error: res.raison }, { status: res.raison?.includes("introuvable") ? 404 : 409 });
  return NextResponse.json({ ok: true });
}
