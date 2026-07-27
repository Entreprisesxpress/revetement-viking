import { NextRequest, NextResponse } from "next/server";
import { ajouterExtra, listerExtras, marquerExtraCharge, supprimerExtra, compterExtrasACharger, getProjet } from "@/lib/db";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";
import { envoyerPushUtilisateur } from "@/lib/push";

export const dynamic = "force-dynamic";

function ipDe(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined; }
function noStore(data: any) { return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } }); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("compteur") === "1") return noStore(await compterExtrasACharger());
  const statut = sp.get("statut") || undefined;
  return noStore(await listerExtras(statut));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "requête invalide" }, { status: 400 });
    if (!body.description || !body.description.trim()) {
      return NextResponse.json({ error: "description requise" }, { status: 400 });
    }
    // Virgule décimale québécoise acceptée (« 88,50 »).
    const num = (v: any) => Number(String(v ?? "").replace(",", ".").trim());
    const montantVal = body.montant != null && body.montant !== "" ? num(body.montant) : null;
    const heuresVal = body.heures != null && body.heures !== "" ? num(body.heures) : null;
    if ((montantVal !== null && !isFinite(montantVal)) || (heuresVal !== null && !isFinite(heuresVal))) {
      return NextResponse.json({ error: "montant ou heures invalide" }, { status: 400 });
    }
    const user = await utilisateurActif(req);
    const id = await ajouterExtra({
      projet_id: body.projet_id ? +body.projet_id : null,
      date: body.date || new Date().toISOString().slice(0, 10),
      nature: body.nature || "montant",
      description: body.description.trim(),
      montant: montantVal,
      heures: heuresVal,
      photo_data: body.photo_data || null,
      thumb_data: body.thumb_data || null,
      saisi_par: user || undefined,
    });

    // Notifications NON bloquantes (une notif/audit qui échoue ne doit pas faire
    // croire à un échec de l'ajout → risque de double extra au 2e essai).
    (async () => {
      let projetNom = "";
      if (body.projet_id) { try { projetNom = (await getProjet(+body.projet_id))?.nom || ""; } catch {} }
      journaliser("extra.ajoute", {
        ref_type: "extra", ref_id: id, utilisateur: user || undefined,
        description: `${body.nature || "extra"} · ${projetNom || "projet ?"} · ${body.description.slice(0, 60)}`,
        ip: ipDe(req),
      }).catch(() => {});
      const montantTxt = body.montant ? ` (${(+body.montant).toLocaleString("fr-CA")} $)` : body.heures ? ` (${body.heures} h)` : "";
      envoyerPushUtilisateur("Francis", {
        title: "💲 Extra à facturer",
        body: `${user || "Quelqu'un"} a ajouté un extra${projetNom ? ` sur ${projetNom}` : ""}${montantTxt} : ${body.description.slice(0, 80)}`,
        url: "/extras", tag: "extra",
      }).catch(() => {});
    })().catch(() => {});

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("[/api/extras POST]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur lors de l'enregistrement" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const user = await utilisateurActif(req);
  const charge = body.statut === "charge";
  await marquerExtraCharge(+body.id, charge);
  journaliser(charge ? "extra.charge" : "extra.rouvert", {
    ref_type: "extra", ref_id: body.id, utilisateur: user || undefined,
    description: charge ? "Extra marqué facturé" : "Extra remis à facturer", ip: ipDe(req),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const user = await utilisateurActif(req);
  await supprimerExtra(+id);
  journaliser("extra.supprime", { ref_type: "extra", ref_id: id, utilisateur: user || undefined, description: `Suppression extra #${id}`, ip: ipDe(req) });
  return NextResponse.json({ ok: true });
}
