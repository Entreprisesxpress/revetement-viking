import { NextRequest, NextResponse, after } from "next/server";
import { listerEmployesLite, ajouterEmploye, modifierEmploye, supprimerEmploye, getEmploye } from "@/lib/db";
import { nombreSaisi } from "@/lib/calculs";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";
import { idEntier, lireCorps, texte } from "@/lib/requete";
export const dynamic = "force-dynamic";

// Champs dont tout changement laisse une trace avant/après dans le journal : le taux
// horaire et la DAS décident de la paie, « actif » décide qui apparaît dans les listes.
const CHAMPS_AUDITES = ["taux_horaire", "das_pct", "actif"] as const;

// Données d'employé (NAS, coordonnées, contact d'urgence) : jamais gardées par un cache,
// partagé ou non. L'ancien `s-maxage=60` autorisait un cache CDN à conserver la liste
// complète — NAS et spécimen de chèque compris.
const SANS_CACHE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const idBrut = req.nextUrl.searchParams.get("id");
  // Fiche complète (NAS, date de naissance, spécimen) uniquement à l'unité, par `?id=`.
  if (idBrut !== null) {
    const id = idEntier(idBrut);
    if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
    const e = await getEmploye(id);
    if (!e) return NextResponse.json({ error: "employé introuvable" }, { status: 404, headers: SANS_CACHE });
    return NextResponse.json(e, { headers: SANS_CACHE });
  }
  // La liste ne porte jamais les champs sensibles (voir listerEmployesLite).
  return NextResponse.json(await listerEmployesLite(), { headers: SANS_CACHE });
}

export async function POST(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  b.nom = texte(b.nom, 200);
  if (!b.nom || !b.taux_horaire) {
    return NextResponse.json({ error: "nom et taux_horaire requis" }, { status: 400 });
  }
  // Virgule décimale : `+"30,50"` donnait NaN, et NaN était STOCKÉ comme taux horaire —
  // toutes les paies de l'employé sortaient ensuite à NaN $.
  const taux = nombreSaisi(b.taux_horaire);
  if (!Number.isFinite(taux) || taux <= 0 || taux > 500) {
    return NextResponse.json({ error: "taux_horaire invalide (ex. : 30,50)" }, { status: 400 });
  }
  const id = await ajouterEmploye({ nom: b.nom, taux_horaire: taux, das_pct: b.das_pct ?? 0.15 });
  // ajouterEmploye n'insère que les colonnes de base : sans ce complément, une case
  // « Reçoit un talon » décochée à la création était ignorée (défaut SQL = 1).
  const extras: any = {};
  for (const k of ["recoit_talon", "telephone", "courriel", "adresse", "date_naissance", "nas",
                   "date_embauche", "poste", "contact_urgence_nom", "contact_urgence_lien",
                   "contact_urgence_tel", "specimen_cheque_data", "specimen_cheque_type", "notes"]) {
    if (b[k] !== undefined && b[k] !== "") extras[k] = b[k];
  }
  if (Object.keys(extras).length) await modifierEmploye(id, extras);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  const id = idEntier(b.id);
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  // Un nom vide ou null effaçait le nom de la fiche : la paie et les heures de l'employé
  // restaient groupées sous un nom que plus aucune fiche ne portait.
  if (b.nom !== undefined) {
    b.nom = texte(b.nom, 200);
    if (!b.nom) return NextResponse.json({ error: "nom requis" }, { status: 400 });
  }
  if (b.taux_horaire !== undefined) {
    const taux = nombreSaisi(b.taux_horaire);
    if (!Number.isFinite(taux) || taux <= 0 || taux > 500) {
      return NextResponse.json({ error: "taux_horaire invalide (ex. : 30,50)" }, { status: 400 });
    }
    b.taux_horaire = taux;
  }
  if (b.das_pct !== undefined && b.das_pct !== null && b.das_pct !== "") {
    const das = nombreSaisi(b.das_pct);
    if (!Number.isFinite(das) || das < 0 || das > 1) {
      return NextResponse.json({ error: "das_pct invalide (fraction entre 0 et 1, ex. : 0,15)" }, { status: 400 });
    }
    b.das_pct = das;
  }
  const avant = await getEmploye(id);
  if (!avant) return NextResponse.json({ error: "employé introuvable" }, { status: 404 });
  await modifierEmploye(id, b);
  const changes = CHAMPS_AUDITES.filter((k) => b[k] !== undefined && String(b[k]) !== String((avant as any)[k]));
  if (changes.length) {
    const user = await utilisateurActif(req);
    const extrait = (o: any) => Object.fromEntries(changes.map((k) => [k, o?.[k]]));
    after(() => journaliser("employe.modifie", {
      ref_type: "employe", ref_id: id, utilisateur: user || undefined,
      description: `${avant.nom} · ${changes.map((k) => `${k} ${(avant as any)[k]} → ${b[k]}`).join(", ")}`,
      avant: extrait(avant), apres: extrait(b),
    }));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = idEntier(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id invalide" }, { status: 400 });
  const avant = await getEmploye(id);
  if (!avant) return NextResponse.json({ error: "employé introuvable" }, { status: 404 });
  await supprimerEmploye(id);
  // Désactivation (soft delete) : même trace qu'un changement de « actif ».
  const user = await utilisateurActif(req);
  after(() => journaliser("employe.modifie", {
    ref_type: "employe", ref_id: id, utilisateur: user || undefined,
    description: `${avant.nom || `Employé #${id}`} · actif ${avant.actif ?? "?"} → 0 (désactivation)`,
    avant: { actif: avant.actif ?? null }, apres: { actif: 0 },
  }));
  return NextResponse.json({ ok: true });
}
