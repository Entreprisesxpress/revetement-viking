import { NextRequest, NextResponse } from "next/server";
import { listerProjets, getProjet, ajouterProjet, modifierProjet, supprimerProjet, trouverOuCreerClient, charger } from "@/lib/db";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const statut = req.nextUrl.searchParams.get("statut") || undefined;
  if (id) {
    const p = await getProjet(+id);
    if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(p);
  }
  return NextResponse.json(await listerProjets(statut));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Si on convertit depuis une soumission, charger ses données
  if (body.fromSoumission) {
    const s = await charger(body.fromSoumission);
    if (!s) return NextResponse.json({ error: "soumission introuvable" }, { status: 404 });

    // Trouver ou créer le client
    const client_id = await trouverOuCreerClient(s.client_nom, {
      courriel: s.client_courriel,
      telephone: s.client_telephone,
      adresse: s.client_adresse,
    });

    const id = await ajouterProjet({
      client_id,
      nom: s.projet || `Projet ${s.client_nom}`,
      adresse_chantier: s.client_adresse,
      description: `Soumission ${s.numero} - ${formatCAD(s.total)}`,
      soumission_numero: s.numero,
      budget_estime: s.total,
      heures_estimees: s.heures_estimees,
      date_debut: new Date().toISOString().slice(0, 10),
      statut: 'actif',
    });
    return NextResponse.json({ ok: true, id });
  }

  // Si client_id n'est pas fourni mais client_nom oui, on crée le client
  if (!body.client_id && body.client_nom) {
    body.client_id = await trouverOuCreerClient(body.client_nom);
  }

  const id = await ajouterProjet(body);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  await modifierProjet(body.id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerProjet(+id);
  return NextResponse.json({ ok: true });
}

function formatCAD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);
}
