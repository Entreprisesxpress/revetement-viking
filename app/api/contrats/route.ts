import { NextRequest, NextResponse } from "next/server";
import { listerContrats, getContrat, ajouterContrat, modifierContrat, supprimerContrat } from "@/lib/db";
import { validerEcritureArgent } from "@/lib/validation-argent";

// Bornes partagées (mêmes que factures, dépenses, extras). Sans elles, un montant NaN ou
// aberrant entrait tel quel : un contrat à 0 $ ou à 1e21 faussait le CA et les dépôts.
const BORNES_CONTRAT = {
  champsMontant: ["montant_avant_taxes", "montant_total", "depot_montant"],
  champsDate: ["date_emission", "date_debut_travaux", "date_fin_prevue", "date_signature"],
  refuserNegatif: true,
};

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const statut = req.nextUrl.searchParams.get("statut");
  if (id) return NextResponse.json(await getContrat(+id));
  return NextResponse.json(await listerContrats(statut || undefined));
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.titre || !b.date_emission) return NextResponse.json({ error: "titre + date_emission requis" }, { status: 400 });
  const invalide = validerEcritureArgent(b, BORNES_CONTRAT);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  const r = await ajouterContrat(b);
  return NextResponse.json({ ok: true, ...r });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const invalide = validerEcritureArgent(b, BORNES_CONTRAT);
  if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
  await modifierContrat(+b.id, b);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerContrat(+id);
  return NextResponse.json({ ok: true });
}
