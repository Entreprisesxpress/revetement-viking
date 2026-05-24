import { NextRequest, NextResponse } from "next/server";
import { listerDepensesProjet, ajouterDepenseProjet, supprimerDepenseProjet } from "@/lib/db";

export async function GET(req: NextRequest) {
  const projet_id = req.nextUrl.searchParams.get("projet_id");
  if (!projet_id) return NextResponse.json({ error: "projet_id requis" }, { status: 400 });
  return NextResponse.json(await listerDepensesProjet(+projet_id));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.projet_id || !body.montant || !body.date) {
    return NextResponse.json({ error: "projet_id, montant et date requis" }, { status: 400 });
  }
  const id = await ajouterDepenseProjet(body);
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerDepenseProjet(+id);
  return NextResponse.json({ ok: true });
}
