import { NextRequest, NextResponse } from "next/server";
import { listerHeuresProjet, ajouterHeureProjet, supprimerHeureProjet, modifierHeureProjet, listerToutesHeures, getHeureProjet, projetReferenceValide, employeParNom } from "@/lib/db";
import { journaliser } from "@/lib/audit";
import { utilisateurActif } from "@/lib/authUser";

import { ipClient } from "@/lib/ip";
const ipDe = (req: NextRequest) => ipClient(req);

/** Validation souple : on coerce les types et on rejette uniquement les valeurs aberrantes.
 *  La validation stricte de types était trop agressive — bloquait des saisies légitimes. */
const RX_DATE = /^\d{4}-\d{2}-\d{2}$/;
function valider(body: any): string | null {
  if (!body || typeof body !== "object") return "payload invalide";
  if (body.date !== undefined && body.date !== null) {
    if (typeof body.date !== "string" || !RX_DATE.test(body.date)) return "date doit être au format YYYY-MM-DD";
  }
  if (body.heures !== undefined && body.heures !== null) {
    const h = Number(body.heures);
    if (!isFinite(h)) return "heures doit être un nombre";
    if (h < 0) return "heures négatives non permises (modifie ou supprime l'entrée existante à corriger)";
    if (h > 24) return "heures > 24 sur une seule entrée (utiliser 2 entrées séparées pour 2 jours)";
  }
  if (body.taux_horaire !== undefined && body.taux_horaire !== null && body.taux_horaire !== "") {
    const t = Number(body.taux_horaire);
    if (!isFinite(t) || t < 0) return "taux horaire invalide";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const projet_id = sp.get("projet_id");
  if (projet_id) return NextResponse.json(await listerHeuresProjet(+projet_id));
  const filtres: any = {};
  if (sp.get("employe")) filtres.employe = sp.get("employe");
  if (sp.get("depuis")) filtres.depuis = sp.get("depuis");
  if (sp.get("jusqu_a")) filtres.jusqu_a = sp.get("jusqu_a");
  if (sp.get("limit")) filtres.limit = +sp.get("limit")!;
  return NextResponse.json(await listerToutesHeures(filtres));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.projet_id || !body.date || !body.heures) {
    return NextResponse.json({ error: "projet_id, date et heures requis" }, { status: 400 });
  }
  const err = valider(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  // Des heures rattachées à un projet inexistant n'apparaissent sur aucune fiche mais
  // pèsent quand même dans le coût de main-d'œuvre global et dans la paie.
  if (!(await projetReferenceValide(body.projet_id))) {
    return NextResponse.json({ error: "projet introuvable" }, { status: 400 });
  }
  // L'employé doit exister : un nom mal tapé créait une paie fantôme groupée sous ce nom.
  // Et le taux vient de SA FICHE, jamais de la requête ni d'un défaut : sans taux,
  // ajouterHeureProjet() posait 90 $/h en silence — dans le coût de main-d'œuvre et la paie.
  const emp = await employeParNom(body.employe);
  if (!emp) return NextResponse.json({ error: `employé inconnu ou inactif : ${body.employe || "(vide)"}` }, { status: 400 });
  const tauxFiche = Number(emp.taux_horaire);
  if (!Number.isFinite(tauxFiche) || tauxFiche <= 0) {
    return NextResponse.json({ error: `taux horaire absent sur la fiche de ${emp.nom} — corrige la fiche avant de saisir des heures` }, { status: 400 });
  }
  const user = await utilisateurActif(req);
  const id = await ajouterHeureProjet({ ...body, employe: emp.nom, taux_horaire: tauxFiche, ajoute_par: user || undefined });
  journaliser("heures.ajoutees", {
    ref_type: "heures", ref_id: id, utilisateur: user || undefined,
    description: `${body.employe || "?"} · ${body.heures}h · projet ${body.projet_id} · ${body.date}`,
    apres: { projet_id: body.projet_id, date: body.date, heures: body.heures, employe: emp.nom, taux_horaire: tauxFiche },
    ip: ipDe(req),
  });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const err = valider(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  // Snapshot avant modification pour audit
  const avant = await getHeureProjet(+body.id);
  if (!avant) return NextResponse.json({ error: "entrée introuvable" }, { status: 404 });
  // Verrouillage optimiste (B7) : si le client fournit `version`, on refuse (409) si
  // la ligne a changé entre-temps, au lieu d'écraser silencieusement.
  const res = await modifierHeureProjet(+body.id, body, body.version);
  if (!res.ok) {
    if (res.conflit) return NextResponse.json({ error: "conflit", message: "Cette entrée a été modifiée par quelqu'un d'autre entre-temps. Recharge la liste avant de sauvegarder.", versionActuelle: res.versionActuelle }, { status: 409 });
    return NextResponse.json({ error: "entrée introuvable" }, { status: 404 });
  }
  const apres = await getHeureProjet(+body.id);
  journaliser("heures.modifiees", {
    ref_type: "heures", ref_id: body.id,
    description: `${avant.employe || "?"} · ${avant.heures}h → ${apres?.heures}h sur ${apres?.date}`,
    avant: { date: avant.date, heures: avant.heures, employe: avant.employe, projet_id: avant.projet_id, taux_horaire: avant.taux_horaire, description: avant.description },
    apres: { date: apres?.date, heures: apres?.heures, employe: apres?.employe, projet_id: apres?.projet_id, taux_horaire: apres?.taux_horaire, description: apres?.description },
    ip: ipDe(req),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  // Snapshot avant suppression pour traçabilité paie/audit
  const avant = await getHeureProjet(+id);
  // Refus si ces heures sont couvertes par une paie déjà versée.
  const res = await supprimerHeureProjet(+id);
  if (!res.ok) return NextResponse.json({ error: res.raison }, { status: 409 });
  journaliser("heures.supprimees", {
    ref_type: "heures", ref_id: id,
    description: `${avant?.employe || "?"} · ${avant?.heures}h sur ${avant?.date}`,
    avant: avant ? { date: avant.date, heures: avant.heures, employe: avant.employe, projet_id: avant.projet_id, taux_horaire: avant.taux_horaire } : null,
    ip: ipDe(req),
  });
  return NextResponse.json({ ok: true });
}
