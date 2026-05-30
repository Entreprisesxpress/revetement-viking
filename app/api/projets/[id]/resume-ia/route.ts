import { NextRequest, NextResponse } from "next/server";
import { getProjet, listerHeuresProjet, listerDepensesProjet, listerPhotosChantier } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Résumé IA d'un chantier : agrège heures + dépenses + photos + notes
 *  et appelle Claude (ANTHROPIC_API_KEY) pour produire un récap pro. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = +id;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurée" }, { status: 500 });
  }
  const [projet, heures, depenses, photos] = await Promise.all([
    getProjet(pid),
    listerHeuresProjet(pid),
    listerDepensesProjet(pid, { sansData: true }),
    listerPhotosChantier(pid, { sansData: true }),
  ]);
  if (!projet) return NextResponse.json({ error: "projet introuvable" }, { status: 404 });

  // Agrégats par jour pour donner du contexte à l'IA
  const parJour: Record<string, { heures: number; employes: Set<string>; descriptions: string[]; photos: number }> = {};
  for (const h of heures) {
    if (!parJour[h.date]) parJour[h.date] = { heures: 0, employes: new Set(), descriptions: [], photos: 0 };
    parJour[h.date].heures += h.heures || 0;
    if (h.employe) parJour[h.date].employes.add(h.employe);
    if (h.description?.trim()) parJour[h.date].descriptions.push(h.description.trim());
  }
  for (const p of photos) { if (parJour[p.date]) parJour[p.date].photos++; }
  const joursTries = Object.keys(parJour).sort();
  const totalH = heures.reduce((s, h) => s + (h.heures || 0), 0);
  const totalDep = depenses.reduce((s: number, d: any) => s + (d.montant || 0), 0);

  const contexte = `PROJET : ${projet.nom}
Client : ${(projet as any).client_nom || "—"}
Adresse : ${projet.adresse_chantier || "—"}
Prix contrat : ${(projet as any).prix_contrat || projet.budget_estime || 0} $
Statut : ${projet.statut}
Description : ${projet.description || "—"}

TOTAUX :
- Heures travaillées : ${totalH.toFixed(1)} h
- Coût main-d'œuvre : ${(projet as any).cout_main_oeuvre?.toFixed?.(2) || "?"} $
- Dépenses matériaux : ${totalDep.toFixed(2)} $
- Nombre de photos : ${photos.length}

JOURNAL DE CHANTIER (${joursTries.length} jours travaillés) :
${joursTries.map((j) => {
  const d = parJour[j];
  return `\n• ${j} — ${d.heures.toFixed(1)}h · ${[...d.employes].join(", ")} · ${d.photos} photo(s)\n  ${d.descriptions.join(" / ") || "(sans description)"}`;
}).join("")}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `Tu es l'assistant de Revêtement Viking Inc. (rénovation extérieure résidentielle, Québec). Voici les données d'un chantier. Produis un résumé professionnel en français du Québec, en 3 sections :

1. ÉTAT DU CHANTIER (1-2 phrases sur l'avancement)
2. POINTS CLÉS (3-5 puces — étapes complétées, particularités, gros postes de dépense, photos prises)
3. PROCHAINES ÉTAPES SUGGÉRÉES (2-3 puces, actions concrètes)

Ton concret, terrain. Pas de blabla. Évite les guillemets. Termine par une ligne « RENTABILITÉ : … » avec une appréciation rapide (excellente / correcte / à surveiller / déficitaire) basée sur les chiffres.

DONNÉES :
${contexte}`,
        }],
      }),
    });
    const data = await r.json();
    const texte = data?.content?.[0]?.text || "Pas de résumé généré.";
    return NextResponse.json({ ok: true, resume: texte, contexte_tokens: data?.usage });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur IA" }, { status: 500 });
  }
}
