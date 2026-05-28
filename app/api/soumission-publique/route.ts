// API publique (sans auth) pour la signature de soumission par le client.
// Sécurité : le token HMAC dans l'URL fait foi — sans lui, accès refusé.
import { NextRequest, NextResponse } from "next/server";
import { charger, marquerSoumissionVue, signerSoumission, refuserSoumission } from "@/lib/db";
import { verifierTokenSoumission } from "@/lib/lien-public";
import { journaliser } from "@/lib/audit";

export const dynamic = "force-dynamic";

function ipDe(req: NextRequest) { return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined; }

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const numero = sp.get("numero") || "";
    const token = sp.get("token") || "";
    if (!numero || !token || !(await verifierTokenSoumission(numero, token))) {
      return NextResponse.json({ error: "lien invalide" }, { status: 403 });
    }
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    // Marque comme vue (1re fois)
    if (!s.vue_client_le) {
      marquerSoumissionVue(numero);
      journaliser("soumission.statut_change", { ref_type: "soumission", ref_id: numero, description: "👁 Vue par le client (lien public)", ip: ipDe(req) });
    }
    // Retourne UNIQUEMENT les infos nécessaires au client (pas les coûts internes)
    const payload = JSON.parse(s.payload_json || "{}");
    return NextResponse.json({
      numero: s.numero,
      date_creation: s.date_creation,
      client_nom: s.client_nom,
      client_adresse: s.client_adresse,
      projet: s.projet,
      total: s.total,
      statut: s.statut,
      signature_nom: s.signature_nom,
      signature_date: s.signature_date,
      lignes: payload.lignes || [],
      fraisActifs: payload.fraisActifs || [],
      appliquerTaxes: payload.appliquerTaxes,
    });
  } catch (e: any) {
    console.error("[/api/soumission-publique GET]", e);
    return NextResponse.json({ error: "erreur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { numero, token, action, nom } = body || {};
    if (!numero || !token || !(await verifierTokenSoumission(numero, token))) {
      return NextResponse.json({ error: "lien invalide" }, { status: 403 });
    }
    const s = await charger(numero);
    if (!s) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    if (s.statut === "acceptee" || s.statut === "facturee") {
      return NextResponse.json({ error: "déjà acceptée", deja: true }, { status: 409 });
    }
    const ip = ipDe(req);
    if (action === "accepter") {
      if (!nom?.trim()) return NextResponse.json({ error: "nom requis pour signer" }, { status: 400 });
      await signerSoumission(numero, nom.trim(), ip);
      journaliser("soumission.acceptee", { ref_type: "soumission", ref_id: numero, description: `✍️ Signée en ligne par ${nom.trim()}`, apres: { signature_nom: nom.trim() }, ip });
      return NextResponse.json({ ok: true, statut: "acceptee" });
    } else if (action === "refuser") {
      await refuserSoumission(numero, ip);
      journaliser("soumission.refusee", { ref_type: "soumission", ref_id: numero, description: "Refusée en ligne par le client", ip });
      return NextResponse.json({ ok: true, statut: "refusee" });
    }
    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  } catch (e: any) {
    console.error("[/api/soumission-publique POST]", e);
    return NextResponse.json({ error: "erreur" }, { status: 500 });
  }
}
