import { NextRequest, NextResponse } from "next/server";
import { listerTaches, ajouterTache, modifierTache, supprimerTache, terminerTache } from "@/lib/db";
import { aujourdhuiMontreal } from "@/lib/date";
import { idEntier, lireCorps, texte } from "@/lib/requete";

function fail(e: any, status = 500) { console.error("[/api/taches]", e); return NextResponse.json({ error: e?.message || "erreur" }, { status }); }

// Vocabulaire fermé, le même que l'écran /taches (STATUTS : tri de listerTaches ;
// PRIORITES 1-5 ; RECURRENCES : avancerDateRecurrence). Hors liste, une tâche sortait du
// tri, ou sa récurrence ne se recréait jamais (la date n'avançait pas), sans message.
const STATUTS = new Set(["a_faire", "en_cours", "complete"]);
const RECURRENCES = new Set(["quotidien", "hebdo", "2sem", "mensuel"]);

/** Valide et normalise les champs fermés + borne les textes. Message d'erreur, ou null. */
function valider(b: any): string | null {
  if (b.titre !== undefined) {
    b.titre = texte(b.titre, 200);
    if (!b.titre) return "titre requis";
  }
  if (b.description !== undefined) b.description = texte(b.description, 5000) || null;
  if (b.statut !== undefined && b.statut !== null && !STATUTS.has(String(b.statut))) {
    return `statut inconnu « ${b.statut} » (attendu : ${[...STATUTS].join(", ")})`;
  }
  if (b.priorite !== undefined && b.priorite !== null && b.priorite !== "") {
    const p = Number(b.priorite);
    if (!Number.isInteger(p) || p < 1 || p > 5) return "priorite doit être un entier de 1 à 5";
    b.priorite = p;
  }
  if (b.recurrence !== undefined && b.recurrence !== null && b.recurrence !== "" && !RECURRENCES.has(String(b.recurrence))) {
    return `recurrence inconnue « ${b.recurrence} » (attendu : ${[...RECURRENCES].join(", ")})`;
  }
  if (b.recurrence === "") b.recurrence = null;
  for (const k of ["client_id", "projet_id"]) {
    if (b[k] === undefined || b[k] === null || b[k] === "") continue;
    const id = idEntier(b[k]);
    if (!id) return `${k} invalide`;
    b[k] = id;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const filtres: any = {};
    if (sp.get("statut")) filtres.statut = sp.get("statut");
    for (const k of ["client_id", "projet_id"]) {
      if (!sp.get(k)) continue;
      const id = idEntier(sp.get(k));
      if (!id) return NextResponse.json({ error: `${k} invalide` }, { status: 400 });
      filtres[k] = id;
    }
    if (sp.get("assigne_a")) filtres.assigne_a = sp.get("assigne_a");
    return NextResponse.json(await listerTaches(filtres));
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const b = await lireCorps(req);
    if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const invalide = valider(b);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    if (!b.titre) return NextResponse.json({ error: "titre requis" }, { status: 400 });
    const id = await ajouterTache(b);
    return NextResponse.json({ ok: true, id });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await lireCorps(req);
    if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
    const id = idEntier(b.id);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const invalide = valider(b);
    if (invalide) return NextResponse.json({ error: invalide }, { status: 400 });
    // Complétion : passe par terminerTache (recrée la prochaine occurrence si récurrente).
    if (b.statut === "complete") {
      const { prochaine } = await terminerTache(id, b.date_completion || aujourdhuiMontreal());
      return NextResponse.json({ ok: true, prochaine });
    }
    if (!(await modifierTache(id, b))) return NextResponse.json({ error: "tâche introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = idEntier(req.nextUrl.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    if (!(await supprimerTache(id))) return NextResponse.json({ error: "tâche introuvable" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
