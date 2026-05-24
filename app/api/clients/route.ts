import { NextRequest, NextResponse } from "next/server";
import { listerClients, getClient, ajouterClient, modifierClient, supprimerClient } from "@/lib/db";
import { asanaEstConfigure, creerTacheAsana, modifierTacheAsana, supprimerTacheAsana, clientVersNotesAsana } from "@/lib/asana";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const c = await getClient(+id);
    if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(c);
  }
  return NextResponse.json(await listerClients());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = await ajouterClient(body);
  // Push vers Asana si configuré et pas déjà lié
  if (asanaEstConfigure() && !body.asana_gid && body.source !== "Asana" && body._skip_asana !== true) {
    try {
      const tache = await creerTacheAsana({
        name: body.nom,
        notes: clientVersNotesAsana(body),
      });
      await modifierClient(id, { asana_gid: tache.gid, asana_modifie_le: tache.modified_at });
    } catch (e: any) {
      console.warn("Asana push failed:", e.message);
    }
  }
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  await modifierClient(body.id, body);
  // Push MAJ vers Asana si client lié
  if (asanaEstConfigure() && body._skip_asana !== true) {
    try {
      const c = await getClient(body.id);
      if (c?.asana_gid) {
        await modifierTacheAsana(c.asana_gid, {
          name: c.nom,
          notes: clientVersNotesAsana(c),
          completed: c.statut === "perdu" || c.statut === "inactif",
        });
      }
    } catch (e: any) {
      console.warn("Asana update failed:", e.message);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  // Récupérer asana_gid avant suppression
  const c = await getClient(+id);
  await supprimerClient(+id);
  if (asanaEstConfigure() && c?.asana_gid) {
    try { await supprimerTacheAsana(c.asana_gid); } catch (e: any) { console.warn("Asana delete failed:", e.message); }
  }
  return NextResponse.json({ ok: true });
}
