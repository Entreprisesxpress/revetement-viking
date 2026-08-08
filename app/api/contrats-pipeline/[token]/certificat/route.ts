import { NextRequest, NextResponse } from "next/server";
import { construireCertificat } from "@/lib/certificat";
import { genererCertificatBuffer } from "@/lib/pdf-certificat";

export const dynamic = "force-dynamic";

// Certificat d'authentification de la signature. Public via le token (comme le PDF du
// contrat) : le client a droit à sa propre preuve de signature, exactement comme le
// « Certificate of Completion » que DocuSign remet aux deux parties.
// ?json=1 renvoie le verdict d'intégrité sans générer le PDF (utilisé par l'écran admin).
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await construireCertificat(token);
  if (!r) return new NextResponse("Not found", { status: 404 });
  if (r.contrat.statut !== "signe") {
    return NextResponse.json({ error: "contrat non signé — aucun certificat à émettre" }, { status: 409 });
  }

  if (req.nextUrl.searchParams.get("json") === "1") {
    return NextResponse.json({
      verdict: r.data.verdict,
      empreinte_scellee: r.data.empreinte_scellee,
      empreinte_actuelle: r.data.empreinte_actuelle,
      signature_nom: r.data.signature_nom,
      signature_date: r.data.signature_date,
    });
  }

  try {
    const buf = await genererCertificatBuffer(r.data);
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename="certificat-${(r.data.numero || token).replace(/[^\w.-]/g, "_")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "échec de génération du certificat : " + (e?.message || "") }, { status: 500 });
  }
}
