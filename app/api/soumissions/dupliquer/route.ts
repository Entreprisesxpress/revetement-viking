import { NextRequest, NextResponse, after } from "next/server";
import { sauvegarder, charger } from "@/lib/db";
import { journaliser } from "@/lib/audit";
import { aujourdhuiMontreal } from "@/lib/date";
import { lireCorps } from "@/lib/requete";

/** Dupliquer une soumission existante : crée une nouvelle entrée avec un numéro neuf,
 * payload identique (articles, taux, etc.), statut "brouillon", date du jour. */
export async function POST(req: NextRequest) {
  try {
    const b = await lireCorps(req);
    if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const numero = String(b.numero || "").trim();
    if (!numero) return NextResponse.json({ error: "numero requis" }, { status: 400 });
    const source = await charger(numero);
    if (!source) return NextResponse.json({ error: "introuvable" }, { status: 404 });
    // payload_json ne contient QUE le « data » (lignes, frais, taxes…). sauvegarder()
    // attend { client, total, heuresEstimees, data } : avant, on lui repassait le data
    // brut → payload.total/heuresEstimees/data étaient undefined → copie VIDE à 0 $.
    // Un payload illisible en base est une erreur EXPLICITE (JSON), jamais une page morte.
    let data: any;
    try { data = JSON.parse(source.payload_json || "{}"); } catch (e: any) {
      console.error(`[/api/soumissions/dupliquer] payload_json illisible pour ${numero} :`, e?.message || e);
      return NextResponse.json({ error: "données de la soumission illisibles", message: `Le contenu enregistré de la soumission ${numero} n'est pas un JSON valide : elle ne peut pas être dupliquée telle quelle.` }, { status: 500 });
    }
    // Réinitialise les champs propres à la soumission source
    delete data.numero;
    data.statut = "brouillon";
    data.date = aujourdhuiMontreal();
    delete data.signature_nom; delete data.signature_date; delete data.vue_client_le;
    const client = { ...(data.client || {}) };
    client.nom = ((source.client_nom || client.nom || "") + " (copie)").trim();
    if (!client.adresse && source.client_adresse) client.adresse = source.client_adresse;
    if (!client.telephone && source.client_telephone) client.telephone = source.client_telephone;
    if (!client.courriel && source.client_courriel) client.courriel = source.client_courriel;
    data.client = client;
    const nouveauNumero = await sauvegarder({
      client,
      total: source.total,
      heuresEstimees: source.heures_estimees,
      data,
    });
    after(() => journaliser("soumission.dupliquee", { ref_type: "soumission", ref_id: nouveauNumero, description: `Dupliquée depuis ${numero}` }));
    return NextResponse.json({ ok: true, numero: nouveauNumero });
  } catch (e: any) {
    console.error("[/api/soumissions/dupliquer]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
