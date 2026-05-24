import { NextRequest, NextResponse } from "next/server";
import { listerClients, getClient, ajouterClient, modifierClient, supprimerClient } from "@/lib/db";

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
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  await modifierClient(body.id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await supprimerClient(+id);
  return NextResponse.json({ ok: true });
}
