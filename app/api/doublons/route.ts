import { NextRequest, NextResponse, after } from "next/server";
import { listerDoublonsSuspects, compterDoublonsSuspects, ignorerDoublon, reactiverDoublon } from "@/lib/db";
import { utilisateurActif } from "@/lib/authUser";
import { journaliser } from "@/lib/audit";
import { lireCorps, texte } from "@/lib/requete";

export const dynamic = "force-dynamic";

function fail(e: any, status = 500) {
  console.error("[/api/doublons]", e);
  return NextResponse.json({ error: e?.message || "erreur" }, { status });
}

/** GET            → les paires suspectes, pièces comprises.
 *  GET ?compte=1  → juste le décompte (pastille, push du matin). */
export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("compte") === "1") {
      return NextResponse.json(await compterDoublonsSuspects(), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await listerDoublonsSuspects(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return fail(e); }
}

/** POST { cle, note? } → « ce n'est pas un doublon ». Décision humaine, datée et signée.
 *  Rien n'est supprimé ni fusionné ici : les deux pièces restent telles quelles, seule
 *  l'alerte se tait. Supprimer la mauvaise facture reste un geste explicite, ailleurs. */
export async function POST(req: NextRequest) {
  try {
    const body = await lireCorps(req);
    if (!body) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const cle = String(body.cle || "").trim().slice(0, 200);
    if (!cle) return NextResponse.json({ error: "cle requise" }, { status: 400 });
    const note = texte(body.note, 500) || undefined;
    const user = await utilisateurActif(req);
    await ignorerDoublon(cle, user, note);
    after(() => journaliser("doublon.ignore", {
      req, utilisateur: user || undefined, ref_type: "doublon", ref_id: cle,
      description: `Écarté : ${cle}${note ? ` — ${note.slice(0, 120)}` : ""}`,
    }));
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

/** DELETE ?cle=… → remet la paire sous surveillance (on l'avait écartée par erreur). */
export async function DELETE(req: NextRequest) {
  try {
    const cle = String(req.nextUrl.searchParams.get("cle") || "").trim();
    if (!cle) return NextResponse.json({ error: "cle requise" }, { status: 400 });
    const user = await utilisateurActif(req);
    await reactiverDoublon(cle);
    after(() => journaliser("doublon.reactive", {
      req, utilisateur: user || undefined, ref_type: "doublon", ref_id: cle,
      description: `Remis sous surveillance : ${cle}`,
    }));
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
