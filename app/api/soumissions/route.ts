import { NextRequest, NextResponse } from "next/server";
import { sauvegarder, lister, charger, supprimer, changerStatut, enregistrerHeuresReelles, statistiques } from "@/lib/db";
import { journaliser } from "@/lib/audit";

function ipDe(req: NextRequest): string | undefined {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined;
}
function fail(e: any, status = 500) { console.error("[/api/soumissions]", e); return NextResponse.json({ error: e?.message || "erreur" }, { status }); }

export async function GET(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");
    const stats = req.nextUrl.searchParams.get("stats");
    const statut = req.nextUrl.searchParams.get("statut") as any;
    if (stats === "1") return NextResponse.json(await statistiques());
    if (numero) {
      const s = await charger(numero);
      if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ ...s, payload: JSON.parse(s.payload_json) });
    }
    return NextResponse.json(await lister(statut || undefined));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "payload invalide" }, { status: 400 });
    const nouveau = !body.numero;
    const numero = await sauvegarder(body);
    journaliser(nouveau ? "soumission.creee" : "soumission.modifiee", {
      ref_type: "soumission", ref_id: numero,
      description: `${body.client?.nom || "?"} · ${body.total ? body.total + " $" : "0 $"}`,
      ip: ipDe(req), user_agent: req.headers.get("user-agent") || undefined,
    });
    return NextResponse.json({ numero, ok: true });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    if (body.statut) {
      await changerStatut(body.numero, body.statut);
      const map: Record<string, any> = {
        envoyee: "soumission.envoyee", acceptee: "soumission.acceptee",
        refusee: "soumission.refusee", facturee: "soumission.facturee",
      };
      journaliser(map[body.statut] || "soumission.statut_change", {
        ref_type: "soumission", ref_id: body.numero,
        description: `Statut → ${body.statut}`,
        apres: { statut: body.statut },
        ip: ipDe(req),
      });
    }
    if (body.heuresReelles !== undefined) await enregistrerHeuresReelles(body.numero, body.heuresReelles);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");
    if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    await supprimer(numero);
    journaliser("soumission.supprimee", {
      ref_type: "soumission", ref_id: numero,
      description: `Suppression définitive`, ip: ipDe(req),
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
