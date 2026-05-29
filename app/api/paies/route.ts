import { NextRequest, NextResponse } from "next/server";
import { listerPaiePeriodes, marquerPayePeriode, supprimerPayePeriode, nettoyerPayePeriodesOrphelines, definirBanqueAppliquee } from "@/lib/db";

export async function GET(req: NextRequest) {
  const employe = req.nextUrl.searchParams.get("employe") || undefined;
  const limit = +(req.nextUrl.searchParams.get("limit") || "12");
  return NextResponse.json(await listerPaiePeriodes(employe, limit));
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  // Choix utilisateur : combler la période avec des heures de la banque
  if (b.banque_appliquee !== undefined) {
    await definirBanqueAppliquee(+b.id, +b.banque_appliquee);
    return NextResponse.json({ ok: true });
  }
  await marquerPayePeriode(+b.id, !!b.paye, b.date_paiement, b.note);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("orphelines") === "1") {
    const n = await nettoyerPayePeriodesOrphelines();
    return NextResponse.json({ ok: true, supprimees: n });
  }
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerPayePeriode(+id);
  return NextResponse.json({ ok: true });
}
