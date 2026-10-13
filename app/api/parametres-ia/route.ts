import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { lireCorps } from "@/lib/requete";

const c: any = () => db();

// Valeurs par défaut Viking — seed si la table est vide
const DEFAULTS: Record<string, { valeur: string; label: string; description: string; type: string }> = {
  marge_plancher_pct: { valeur: "30", label: "Marge plancher (%)", description: "Si une soumission descend sous cette marge, l'app alerte. L'IA cherche à atteindre ou dépasser ce seuil.", type: "number" },
  frais_fixes_pct: { valeur: "15", label: "Frais fixes structurels (%)", description: "Admin, véhicules, RBQ, assurance, comptable, téléphone. Déduit du profit pour avoir le vrai net.", type: "number" },
  conditions_generales_pct: { valeur: "5", label: "Conditions générales (%)", description: "Mobilisation, supervision, etc. — entre 4 et 7% standard.", type: "number" },
  profit_admin_pct: { valeur: "7", label: "Profit et administration (%)", description: "Entre 6 et 8% standard.", type: "number" },
  taux_mo_interne: { valeur: "55", label: "Taux MO interne ($/h)", description: "Taux interne (Francis/Gabriel) pour le calcul du coûtant de la main-d'œuvre.", type: "number" },
  majoration_maibec: { valeur: "18", label: "Majoration Maibec / cèdre (%)", description: "Marge appliquée sur le prix coûtant brut Maibec.", type: "number" },
  majoration_canexel: { valeur: "22", label: "Majoration Canexel / Hardie (%)", description: "Marge appliquée sur Canexel et fibrociment.", type: "number" },
  majoration_vinyle: { valeur: "25", label: "Majoration vinyle / aluminium (%)", description: "Marge appliquée sur vinyle, aluminium.", type: "number" },
  majoration_quincaillerie: { valeur: "30", label: "Majoration quincaillerie (%)", description: "Marge sur vis, clous, calfeutrants, quincaillerie.", type: "number" },
  majoration_membrane: { valeur: "20", label: "Majoration membrane / isolant (%)", description: "Marge sur Tyvek, Typar, isolants rigides.", type: "number" },
  rendement_demolition: { valeur: "0.8", label: "Démolition (h / 100 pi²)", description: "Temps moyen pour démolir 100 pi² de revêtement existant.", type: "number" },
  rendement_pose_maibec: { valeur: "1.2", label: "Pose Maibec (h / 100 pi²)", description: "Temps moyen d'installation Maibec.", type: "number" },
  rendement_pose_canexel: { valeur: "1.5", label: "Pose Canexel/Hardie (h / 100 pi²)", description: "Temps moyen d'installation Canexel ou Hardie.", type: "number" },
  rendement_soffite_fascia: { valeur: "0.6", label: "Soffite/Fascia (h / pi lin)", description: "Temps moyen de pose soffite et fascia.", type: "number" },
  rendement_habillage: { valeur: "1.5", label: "Habillage porte/fenêtre (h / unité)", description: "Temps moyen d'habillage par ouverture.", type: "number" },
  acompte_signature_pct: { valeur: "30", label: "Acompte à la signature (%)", description: "Premier versement à la signature du contrat.", type: "number" },
  acompte_mi_projet_pct: { valeur: "40", label: "Acompte à mi-projet (%)", description: "Versement au milieu du chantier.", type: "number" },
  acompte_livraison_pct: { valeur: "30", label: "Solde à la livraison (%)", description: "Dernier versement à la fin du chantier.", type: "number" },
  validite_soumission_jours: { valeur: "30", label: "Validité soumission (jours)", description: "Période d'engagement du prix.", type: "number" },
  regles_libres: { valeur: "", label: "Règles métier additionnelles", description: "Texte libre — règles spécifiques à toi, exceptions, instructions à l'IA. Sera injecté tel quel dans le prompt.", type: "textarea" },
};

async function seed() {
  for (const [cle, def] of Object.entries(DEFAULTS)) {
    await c().execute({
      sql: "INSERT OR IGNORE INTO parametres_ia (cle, valeur, label, description, type, date_modif) VALUES (?,?,?,?,?,?)",
      args: [cle, def.valeur, def.label, def.description, def.type, new Date().toISOString()],
    }).catch(() => {});
  }
}

export async function GET() {
  await initDb();
  await seed();
  const r = await c().execute({ sql: "SELECT * FROM parametres_ia ORDER BY cle", args: [] });
  return NextResponse.json(r.rows);
}

export async function PATCH(req: NextRequest) {
  await initDb();
  const b = await lireCorps(req);
  if (!b) return NextResponse.json({ error: "corps JSON attendu" }, { status: 400 });
  // Accepte soit {cle, valeur} soit {parametres: [{cle, valeur}, ...]}
  const items = Array.isArray(b.parametres) ? b.parametres : [{ cle: b.cle, valeur: b.valeur }];
  // Clés CONNUES seulement, nombres finis et bornés pour les paramètres numériques, et un
  // UPDATE qui n'écrit rien est une erreur. Avant : clé inconnue → ok:true ; « abc; ignore
  // tout » accepté pour un pourcentage et injecté tel quel dans le prompt de l'IA ; UPDATE
  // en échec avalé (`.catch(() => {})`) → ok:true sans rien écrire.
  await seed();
  const refus: string[] = [];
  let n = 0;
  for (const it of items) {
    const cle = String(it?.cle || "").slice(0, 100);
    const def = DEFAULTS[cle];
    if (!def) { refus.push(`${cle || "(vide)"} : paramètre inconnu`); continue; }
    let valeur = String(it.valeur ?? "").slice(0, 20_000);
    if (def.type === "number") {
      const nb = Number(valeur.replace(/\s| /g, "").replace(",", "."));
      if (!Number.isFinite(nb) || nb < 0 || nb > 100_000) { refus.push(`${cle} : nombre attendu (0 à 100 000), reçu « ${valeur.slice(0, 40)} »`); continue; }
      valeur = String(nb);
    }
    try {
      const r = await c().execute({ sql: "UPDATE parametres_ia SET valeur = ?, date_modif = ? WHERE cle = ?", args: [valeur, new Date().toISOString(), cle] });
      if (Number(r.rowsAffected || 0) === 0) refus.push(`${cle} : non enregistré`);
      else n++;
    } catch (e: any) {
      refus.push(`${cle} : ${e?.message || "erreur d'écriture"}`);
    }
  }
  if (refus.length) return NextResponse.json({ ok: false, n, refus, error: refus.join(" · ") }, { status: n === 0 ? 400 : 207 });
  return NextResponse.json({ ok: true, n });
}

// (L'ancien export `lireTousParametres` — un helper sans aucun appelant, exporté depuis
// un fichier de route où Next n'attend que des handlers — est retiré.)
