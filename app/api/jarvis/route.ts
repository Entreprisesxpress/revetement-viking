import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { MODELES } from "@/lib/viking-ai";
import { OUTILS_JARVIS, OUTILS_ACTION, executerOutilJarvis } from "@/lib/jarvis";
import { utilisateurActif } from "@/lib/authUser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEME = `Tu es « Jarvis », l'assistant d'intelligence d'affaires de Revêtement Viking Inc. (entrepreneur en revêtement extérieur, Québec, RBQ 5811-4299-01). Tu réponds à Francis (le proprio) et à Gabriel à propos de LEURS vraies données d'entreprise.

RÈGLES :
- Utilise TOUJOURS les outils pour obtenir les chiffres réels. Ne devine JAMAIS un montant ou une donnée.
- Pour une question générale, commence par « apercu_entreprise », puis creuse avec les outils spécifiques au besoin.
- Tu peux appeler plusieurs outils, en plusieurs tours, avant de répondre.
- EFFICACITÉ : quand tu as besoin de plusieurs informations INDÉPENDANTES, appelle les outils EN PARALLÈLE (plusieurs outils dans un seul tour) plutôt qu'un à la fois. Ça répond plus vite.
- Réponds en français du Québec, de façon claire et actionnable. Va droit au but.
- Formate les montants en dollars CAD (ex: 12 500 $). Utilise des listes/tableaux courts quand c'est utile.
- Contexte fiscal : taxes TPS 5 % + TVQ 9,975 %. La RENTABILITÉ se calcule AVANT taxes (revenu ÷ 1,14975 − coûts). Le revenu d'un projet = prix de contrat + extras facturés. La main-d'œuvre est un coût.
- Un projet « complété » est considéré facturé.
- Tu peux PROPOSER des actions (créer une tâche, compléter un projet, enregistrer une dépense) via les outils « proposer_* ». Ça n'exécute RIEN : ça affiche un bouton que Francis doit confirmer. Ne dis JAMAIS qu'une action est faite — dis « je te propose de… confirme le bouton ci-dessous ».
- Pour tout le reste, tu es en lecture seule. Si une donnée manque, dis-le franchement plutôt que d'inventer. Termine par une suggestion utile si pertinent.`;

// Marque un point de cache (prompt caching) sur le dernier bloc du dernier message,
// et retire les points de cache des messages précédents. Résultat : chaque tour de la
// boucle relit tout l'historique croissant depuis le cache (~0,1× du prix), au lieu de
// le re-payer plein tarif. On garde un seul point de cache « roulant » côté messages.
function appliquerCacheMessages(messages: any[]) {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) if (b && typeof b === "object") delete b.cache_control;
    }
  }
  const last = messages[messages.length - 1];
  if (last && Array.isArray(last.content) && last.content.length) {
    const b = last.content[last.content.length - 1];
    if (b && typeof b === "object") b.cache_control = { type: "ephemeral" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY manquante" }, { status: 500 });
    const user = await utilisateurActif(req);
    if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 });

    const { question, historique } = await req.json();
    if (!question || !String(question).trim()) return NextResponse.json({ error: "question requise" }, { status: 400 });

    const client = new Anthropic({ apiKey });
    const auj = new Date().toISOString().slice(0, 10);
    const messages: any[] = [];
    if (Array.isArray(historique)) {
      for (const m of historique.slice(-8)) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          messages.push({ role: m.role, content: m.content });
        }
      }
    }
    messages.push({ role: "user", content: String(question) });

    const outilsUtilises: string[] = [];
    const actionsProposees: any[] = [];
    let reponse = "";

    // Prompt système en blocs : la partie stable (SYSTEME + définitions d'outils, via
    // l'ordre tools→system) est mise en cache ; la date + l'utilisateur (volatils) sont
    // placés APRÈS le point de cache pour ne pas invalider le préfixe partagé.
    const systemBlocks = [
      { type: "text", text: SYSTEME, cache_control: { type: "ephemeral" } },
      { type: "text", text: `Date du jour : ${auj}. Tu parles à : ${user}.` },
    ];

    // Boucle tool-use : Claude demande des outils → on exécute → on renvoie → il répond.
    for (let tour = 0; tour < 8; tour++) {
      appliquerCacheMessages(messages); // point de cache roulant sur l'historique

      // Streaming interne : protège contre les timeouts HTTP sur les tours longs
      // (Opus + raisonnement). On récupère le message complet à la fin.
      const stream = client.messages.stream({
        model: MODELES.jarvis, // Opus 4.8 : le plus intelligent
        max_tokens: 4096,
        thinking: { type: "adaptive" }, // le modèle décide quand raisonner en profondeur
        system: systemBlocks as any,
        tools: OUTILS_JARVIS as any,
        messages,
      });
      const resp = await stream.finalMessage();

      messages.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason === "tool_use") {
        // Exécute EN PARALLÈLE tous les outils demandés dans ce tour (au lieu de séquentiel).
        const demandes = resp.content.filter((b: any) => b.type === "tool_use") as any[];
        const resultats = await Promise.all(
          demandes.map(async (tu) => {
            outilsUtilises.push(tu.name);
            const resultat = await executerOutilJarvis(tu.name, tu.input || {});
            return { tu, resultat };
          }),
        );
        const toolResults: any[] = [];
        for (const { tu, resultat } of resultats) {
          if (OUTILS_ACTION.has(tu.name) && (resultat as any)?.propose && (resultat as any).action) {
            actionsProposees.push((resultat as any).action);
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(resultat).slice(0, 60000),
          });
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Réponse finale
      reponse = resp.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
      break;
    }

    if (!reponse) reponse = "Je n'ai pas réussi à formuler une réponse. Reformule ta question ?";
    return NextResponse.json({ ok: true, reponse, outils: Array.from(new Set(outilsUtilises)), actions: actionsProposees });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
