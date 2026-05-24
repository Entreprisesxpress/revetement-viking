import { NextRequest, NextResponse } from "next/server";
import { listerFacturesProjet, ajouterFactureProjet, marquerFacturePayee, supprimerFactureProjet } from "@/lib/db";

export async function GET(req: NextRequest) {
  const projet_id = req.nextUrl.searchParams.get("projet_id");
  if (!projet_id) return NextResponse.json({ error: "projet_id requis" }, { status: 400 });
  return NextResponse.json(await listerFacturesProjet(+projet_id));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.projet_id || !body.montant || !body.date) {
    return NextResponse.json({ error: "projet_id, montant et date requis" }, { status: 400 });
  }
  const id = await ajouterFactureProjet(body);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.action === "marquer_payee") {
    await marquerFacturePayee(body.id, body.date_paiement || new Date().toISOString().slice(0, 10));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerFactureProjet(+id);
  return NextResponse.json({ ok: true });
}
