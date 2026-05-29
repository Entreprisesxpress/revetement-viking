import { NextRequest, NextResponse } from "next/server";
import { listerAssurances, ajouterAssurance, modifierAssurance, supprimerAssurance } from "@/lib/db";

export const dynamic = "force-dynamic";
function fail(e: any) { console.error("[/api/assurances]", e); return NextResponse.json({ error: e?.message || "erreur" }, { status: 500 }); }

export async function GET() {
  try { return NextResponse.json(await listerAssurances(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return fail(e); }
}
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b?.compagnie?.trim() && !b?.type?.trim()) return NextResponse.json({ error: "type ou compagnie requis" }, { status: 400 });
    const id = await ajouterAssurance(b);
    return NextResponse.json({ ok: true, id });
  } catch (e) { return fail(e); }
}
export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b?.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await modifierAssurance(+b.id, b);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await supprimerAssurance(+id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
