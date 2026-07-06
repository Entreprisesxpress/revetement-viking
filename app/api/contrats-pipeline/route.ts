import { NextRequest, NextResponse } from "next/server";
import { creerContratPipeline, listerContratsParClient, marquerContratEnvoye, supprimerContratPipeline } from "@/lib/db";
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
  const user = await utilisateurActif(req);
  const token = genererToken();
  const numero = b.numero || `C-${new Date().getFullYear()}-${String(b.client_id).padStart(3, "0")}`;
  const id = await creerContratPipeline({
    client_id: +b.client_id, numero, token,
    data_json: b.data_json, pdf_brouillon: b.pdf_brouillon,
    cree_par: user || undefined,
  });
  return NextResponse.json({ ok: true, id, token, numero });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id || b.action !== "envoye") return NextResponse.json({ error: "id + action=envoye requis" }, { status: 400 });
  await marquerContratEnvoye(+b.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerContratPipeline(+id);
  return NextResponse.json({ ok: true });
}
