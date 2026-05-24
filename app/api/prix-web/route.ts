import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const PROMPT = (nomProduit: string, codeProduit: string, fournisseur: string) => `
Tu es un assistant qui aide à vérifier les prix de matériaux de construction au Québec.

Produit recherché:
- Nom: ${nomProduit}
- Code: ${codeProduit}
- Fournisseur principal: ${fournisseur}

Cherche ce produit (ou équivalent) sur les sites de fournisseurs québécois courants:
- Patrick Morin (patrickmorin.com)
- Réno-Dépôt (reno-depot.ca)
- Home Depot Canada (homedepot.ca)
- BMR (bmr.co)
- Matériaux 3+ (materiaux3plus.com)
- Site du fournisseur (${fournisseur})

Retourne UNIQUEMENT un JSON valide:
{
  "prix_trouves": [
    {"source": "Patrick Morin", "url": "...", "prix": 28.99, "unite": "boite", "format": "200 pi²", "date_observation": "2026-05-15"}
  ],
  "prix_moyen_estime": 29.50,
  "tendance": "hausse|stable|baisse",
  "note": "commentaire utile (disponibilité, alternatives, etc.)"
}

Si tu ne trouves rien de fiable, retourne {"prix_trouves": [], "note": "explication"}.
Pas de markdown, JSON pur.`;

export async function POST(req: NextRequest) {
  try {
    const { nom, code, fournisseur } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY manquante" }, { status: 500 });
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2048,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as any],
      messages: [{ role: "user", content: PROMPT(nom, code, fournisseur) }],
    });

    const text = response.content
      .filter((c) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
      .trim()
      .replace(/^```json\s*|\s*```$/g, "");

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: true, raw: text, parse_error: true });
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
