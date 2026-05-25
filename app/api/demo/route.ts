// Charge des données de démo pour la présentation
import { NextRequest, NextResponse } from "next/server";
import { sauvegarder, changerStatut, ajouterJobBiblio, db } from "@/lib/db";

const SOUMISSIONS_DEMO = [
  {
    client: { nom: "Marie Lavoie", adresse: "456 rue Principale, Boucherville", telephone: "514-555-9999", courriel: "marie.lavoie@example.com", projet: "Rénovation revêtement vinyle complète" },
    total: 24850,
    heures: 112,
    statut: "acceptee" as const,
  },
  {
    client: { nom: "Jean-François Tremblay", adresse: "789 av. des Érables, Saint-Bruno", telephone: "450-555-3214", courriel: "jftremblay@example.com", projet: "Maibec Canexel bungalow" },
    total: 38200,
    heures: 145,
    statut: "envoyee" as const,
  },
  {
    client: { nom: "Sylvie Roy", adresse: "123 rue du Parc, Longueuil", telephone: "514-555-7811", courriel: "sroy@example.com", projet: "Réparation soffite/fascia urgente" },
    total: 8450,
    heures: 38,
    statut: "facturee" as const,
  },
  {
    client: { nom: "Pierre Bouchard", adresse: "12 montée des Chênes, Mont-Saint-Hilaire", telephone: "450-555-2200", courriel: "pbouchard@example.com", projet: "MAC Harrywood maison 2 étages" },
    total: 56800,
    heures: 195,
    statut: "brouillon" as const,
  },
  {
    client: { nom: "Annie Gauthier", adresse: "888 rue des Frênes, Sainte-Julie", telephone: "514-555-4567", courriel: "agauthier@example.com", projet: "Aluminium horizontal façade" },
    total: 14200,
    heures: 58,
    statut: "refusee" as const,
  },
];

const BIBLIO_DEMO = [
  { adresse: "Bungalow Boucherville (réf. type 1)", type_materiau: "vinyle", parement_pi2: 2150, fascia_pi_lin: 180, soffite_pi2: 320, nb_etages: 1, total_soumission: 24850, heures_reelles: 108, complexite: "moyenne", notes_chantier: "Fronton triangulaire avant, échafaudage 1 montage suffisant" },
  { adresse: "Cottage 2 étages Saint-Bruno (Canexel)", type_materiau: "maibec-canexel", parement_pi2: 2800, fascia_pi_lin: 220, soffite_pi2: 380, nb_etages: 2, total_soumission: 41500, heures_reelles: 162, complexite: "moyenne", notes_chantier: "Coupe Maibec exigeante autour fenêtres en oriels" },
  { adresse: "Maison 2 étages Mont-Saint-Hilaire (MAC)", type_materiau: "mac-harrywood", parement_pi2: 3100, fascia_pi_lin: 250, soffite_pi2: 410, nb_etages: 2, total_soumission: 58400, heures_reelles: 210, complexite: "élevée", notes_chantier: "Pignon avant complexe, 3 jours d'échafaudage. Accès difficile par arrière." },
  { adresse: "Réparation Longueuil (soffite/fascia seul)", type_materiau: "aluminium", parement_pi2: 0, fascia_pi_lin: 145, soffite_pi2: 280, nb_etages: 1, total_soumission: 8200, heures_reelles: 36, complexite: "faible", notes_chantier: "Travail propre, demi-journée" },
];

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  if (action === "reset") {
    // Garde-fou : reset destructif uniquement si DEMO_RESET_ENABLED=1 et confirm=oui-supprimer-tout
    if (process.env.DEMO_RESET_ENABLED !== "1") {
      return NextResponse.json({ error: "Reset désactivé en production. Mettre DEMO_RESET_ENABLED=1 dans Vercel pour activer temporairement." }, { status: 403 });
    }
    const confirm = req.nextUrl.searchParams.get("confirm");
    if (confirm !== "oui-supprimer-tout") {
      return NextResponse.json({ error: "Manque ?confirm=oui-supprimer-tout pour confirmer." }, { status: 400 });
    }
    const c = db();
    await c.execute("DELETE FROM soumissions");
    await c.execute("DELETE FROM bibliotheque_jobs");
    await c.execute("DELETE FROM rendements_reels");
    await c.execute("DELETE FROM projets");
    await c.execute("DELETE FROM clients");
    await c.execute("DELETE FROM heures_projet");
    await c.execute("DELETE FROM factures_projet");
    await c.execute("DELETE FROM depenses_projet");
    return NextResponse.json({ ok: true, reset: true });
  }

  // Insérer données démo
  let nbSoum = 0, nbBiblio = 0;
  for (const s of SOUMISSIONS_DEMO) {
    const numero = await sauvegarder({
      client: s.client,
      total: s.total,
      heuresEstimees: s.heures,
      data: { client: s.client, lignes: [], fraisActifs: [], fraisGestion: 0.15, appliquerTaxes: true },
    });
    if (s.statut !== "brouillon") await changerStatut(numero, s.statut);
    nbSoum++;
  }
  for (const b of BIBLIO_DEMO) {
    await ajouterJobBiblio({ ...b, date_ajout: new Date().toISOString() });
    nbBiblio++;
  }
  return NextResponse.json({ ok: true, soumissions: nbSoum, bibliotheque: nbBiblio });
}
