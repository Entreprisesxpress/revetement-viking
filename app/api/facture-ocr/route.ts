import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MODELES } from "@/lib/viking-ai";

export const dynamic = "force-dynamic";

const PROMPT = `Tu analyses une FACTURE / un contrat de travaux. Trouve le MONTANT TOTAL final à payer (grand total, taxes comprises si présentes).
Réponds UNIQUEMENT par un JSON, sans markdown :
{"total": <nombre ou null>, "confiance": "haute|moyenne|basse"}
- "total" = le montant total final en dollars, en nombre (point décimal, pas de symbole ni d'espace). S'il y a plusieurs totaux, prends le GRAND TOTAL (toutes taxes comprises).
- Si aucun total clair n'est lisible, mets "total": null.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY manquante" });
    const { dataUrl } = await req.json();
    const m = typeof dataUrl === "string" ? dataUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
    if (!m) return NextResponse.json({ ok: false, error: "dataUrl invalide" });
    const mediaType = m[1];
    const data = m[2];

    const contenu: any[] = [];
    if (mediaType === "application/pdf") {
      contenu.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else if (/^image\//.test(mediaType)) {
      contenu.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
    } else {
      return NextResponse.json({ ok: false, error: "format non supporté (image ou PDF)" });
    }
    contenu.push({ type: "text", text: PROMPT });

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODELES.vision_photos,
      max_tokens: 300,
      messages: [{ role: "user", content: contenu }],
    });
    const text = response.content.filter((c) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    const jsonText = text.replace(/^```json\s*|\s*```$/g, "").trim();
    let r: any;
    try { r = JSON.parse(jsonText); } catch { return NextResponse.json({ ok: false, error: "réponse non parsable" }); }
    const brut = r?.total;
    const total = typeof brut === "number" ? brut : (brut ? parseFloat(String(brut).replace(/[^0-9.]/g, "")) : null);
    return NextResponse.json({ ok: true, total: total && total > 0 ? total : null, confiance: r?.confiance || "moyenne" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "erreur" });
  }
}
