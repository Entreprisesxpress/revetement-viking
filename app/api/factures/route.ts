import { NextRequest, NextResponse } from "next/server";
import { listerFacturesProjet, ajouterFactureProjet, marquerFacturePayee, supprimerFactureProjet } from "@/lib/db";
import { aujourdhuiMontreal } from "@/lib/date";

function fail(e: any, status = 500) { console.error("[/api/factures]", e); return NextResponse.json({ error: e?.message || "erreur" }, { status }); }

export async function GET(req: NextRequest) {
  try {
    const projet_id = req.nextUrl.searchParams.get("projet_id");
    if (!projet_id) return NextResponse.json({ error: "projet_id requis" }, { status: 400 });
    return NextResponse.json(await listerFacturesProjet(+projet_id));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Montant : NOMBRE fini exigé (« abc » passait). Négatif toléré (note de crédit).
    const montant = Number(body.montant);
    if (!body.projet_id || !body.montant || !isFinite(montant) || !body.date) {
      return NextResponse.json({ error: "projet_id, montant (nombre) et date requis" }, { status: 400 });
    }
    body.montant = montant;
    const id = await ajouterFactureProjet(body);
    return NextResponse.json({ ok: true, id });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    if (body.action === "marquer_payee") {
      await marquerFacturePayee(body.id, body.date_paiement || aujourdhuiMontreal());
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await supprimerFactureProjet(+id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
