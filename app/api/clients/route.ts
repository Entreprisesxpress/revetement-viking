import { NextRequest, NextResponse } from "next/server";
import { listerClients, getClient, ajouterClient, modifierClient, supprimerClient } from "@/lib/db";
import { asanaEstConfigure, creerTacheAsana, modifierTacheAsana, supprimerTacheAsana, clientVersNotesAsana } from "@/lib/asana";
import { journaliser } from "@/lib/audit";

function ipDe(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined; }
function fail(e: any, status = 500) { console.error("[/api/clients]", e); return NextResponse.json({ error: e?.message || "erreur" }, { status }); }

/** Push Asana en arrière-plan (jamais bloquant pour le client) */
function asanaSyncFireAndForget(op: "create" | "update" | "delete", payload: any) {
  if (!asanaEstConfigure()) return;
  (async () => {
    try {
      if (op === "create") {
        const t = await creerTacheAsana({ name: payload.nom, notes: clientVersNotesAsana(payload) });
        await modifierClient(payload._id, { asana_gid: t.gid, asana_modifie_le: t.modified_at });
      } else if (op === "update") {
        const c = await getClient(payload._id);
        if (c?.asana_gid) {
          await modifierTacheAsana(c.asana_gid, { name: c.nom, notes: clientVersNotesAsana(c), completed: c.statut === "perdu" || c.statut === "inactif" });
        }
      } else if (op === "delete") {
        if (payload.asana_gid) await supprimerTacheAsana(payload.asana_gid);
      }
    } catch (e: any) { console.warn(`Asana ${op} failed:`, e.message); }
  })();
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const c = await getClient(+id);
      if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(c);
    }
    return NextResponse.json(await listerClients());
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.nom?.trim()) return NextResponse.json({ error: "nom requis" }, { status: 400 });
    const id = await ajouterClient(body);
    journaliser("client.cree", { ref_type: "client", ref_id: id, description: body.nom, ip: ipDe(req) });
    if (!body.asana_gid && body.source !== "Asana" && body._skip_asana !== true) {
      asanaSyncFireAndForget("create", { ...body, _id: id });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await modifierClient(body.id, body);
    journaliser("client.modifie", { ref_type: "client", ref_id: body.id, description: body.nom || `id ${body.id}`, ip: ipDe(req) });
    if (body._skip_asana !== true) {
      asanaSyncFireAndForget("update", { _id: body.id });
    }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const c = await getClient(+id);
    await supprimerClient(+id);
    journaliser("client.supprime", { ref_type: "client", ref_id: id, description: c?.nom || `id ${id}`, ip: ipDe(req) });
    if (c?.asana_gid) asanaSyncFireAndForget("delete", { asana_gid: c.asana_gid });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
