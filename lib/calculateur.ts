// Moteur de calcul de soumission
import {
  MATERIAUX,
  type Materiau,
  type Categorie,
} from "@/data/materiaux";
import {
  TAUX_HORAIRE_VENTE,
  RENDEMENT_HOMME_HEURE,
  PARAMS_DEFAUT,
  FRAIS_FORFAITAIRES,
} from "@/data/main-oeuvre";

export interface LigneSoumission {
  materiauCode: string;
  quantite: number;
  surplus: number;
  margePct: number;
  couleur?: string; // optionnel, affiché sur PDF
  note?: string;
}

export interface FraisActif {
  id: string;
  heures: number;
}

export interface ParametresSoumission {
  lignes: LigneSoumission[];
  fraisActifs: FraisActif[];
  fraisGestion: number; // ex 0.15
  appliquerTaxes: boolean;
}

export interface LigneCalculee {
  materiau: Materiau;
  quantiteBase: number;
  quantiteAvecSurplus: number;
  formatACommander: number; // nb de boîtes / rouleaux à commander
  coutMateriau: number;
  prixVenteMateriau: number;
  heuresMO: number;
  coutMO: number;
  sousTotal: number;
}

export interface SoumissionCalculee {
  lignes: LigneCalculee[];
  /** Même ordre que les lignes SAISIES ; `null` pour un code absent du catalogue. */
  parIndex: (LigneCalculee | null)[];
  totalCoutMateriaux: number;
  totalVenteMateriaux: number;
  totalHeuresInstallation: number;
  totalHeuresForfaitaires: number;
  totalHeures: number;
  totalCoutMO: number;
  sousTotalMateriauxMO: number;
  fraisGestionMontant: number;
  sousTotalAvantTaxes: number;
  tps: number;
  tvq: number;
  total: number;
}

/** Arrondi au cent, sans le biais binaire de Math.round(x * 100) sur les .xx5. */
export function auCent(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculerSoumission(p: ParametresSoumission): SoumissionCalculee {
  const lignesCalc: LigneCalculee[] = [];
  let totalCoutMat = 0;
  let totalVenteMat = 0;
  let totalHeuresInstall = 0;

  // Une entrée par ligne SAISIE (nulle si le code n'est plus au catalogue) : le formulaire
  // appariait `calcul.lignes[idx]` à `lignes[idx]`, et une ligne inconnue décalait tous
  // les sous-totaux affichés d'un cran.
  const parIndex: (LigneCalculee | null)[] = [];
  for (const l of p.lignes) {
    const mat = MATERIAUX.find((m) => m.code === l.materiauCode);
    if (!mat) { parIndex.push(null); continue; }

    // Arrondi au millionième AVANT le plafond : en flottant, 50 × 1,1 = 55,000000000000001
    // et `ceil` commandait 56 pièces au lieu de 55 (45 matériaux du catalogue touchés, une
    // boîte de soffite de trop = +395 $ coûtant, repris par la vente, le PDF et la liste).
    const qtyAvecSurplus = Math.round(l.quantite * (1 + l.surplus) * 1e6) / 1e6;
    const formatACommander = Math.ceil(Math.round((qtyAvecSurplus / mat.qtyParFormat) * 1e6) / 1e6);

    // Coût réel = format à commander × prix par format (on commande des boîtes entières)
    const coutMat = formatACommander * mat.prixCoutantParFormat;
    const venteMat = coutMat * (1 + l.margePct);

    const rendement = RENDEMENT_HOMME_HEURE[mat.categorie] || 30;
    const heuresMO = qtyAvecSurplus / rendement;
    const coutMO = heuresMO * TAUX_HORAIRE_VENTE;

    const sousTotal = venteMat + coutMO;

    const ligneCalc = {
      materiau: mat,
      quantiteBase: l.quantite,
      quantiteAvecSurplus: qtyAvecSurplus,
      formatACommander,
      coutMateriau: coutMat,
      prixVenteMateriau: venteMat,
      heuresMO,
      coutMO,
      sousTotal,
      couleur: l.couleur,
      note: l.note,
    } as any as LigneCalculee;
    lignesCalc.push(ligneCalc);
    parIndex.push(ligneCalc);

    totalCoutMat += coutMat;
    totalVenteMat += venteMat;
    totalHeuresInstall += heuresMO;
  }

  // Un frais reçu par l'API sans `heures` (ou avec « 2,5 » en chaîne) rendait NaN, et le
  // total d'heures estimées de toute la soumission avec lui.
  const totalHeuresForfait = p.fraisActifs.reduce((s, f) => s + (Number(f.heures) || 0), 0);
  const totalHeures = totalHeuresInstall + totalHeuresForfait;
  const totalCoutMO = totalHeures * TAUX_HORAIRE_VENTE;

  // Sous-totaux, TPS et TVQ arrondis AU CENT, et le total = somme des arrondis : c'est
  // ce que le client recalcule sur le PDF. Avant, les taxes gardaient leurs décimales et
  // le total affiché pouvait différer d'un cent de « sous-total + TPS + TVQ » imprimés.
  const sousTotalMatMO = auCent(totalVenteMat + totalCoutMO);
  const fraisGestionMontant = auCent(sousTotalMatMO * p.fraisGestion);
  const sousTotalAvantTaxes = auCent(sousTotalMatMO + fraisGestionMontant);

  const tps = p.appliquerTaxes ? auCent(sousTotalAvantTaxes * PARAMS_DEFAUT.tps) : 0;
  const tvq = p.appliquerTaxes ? auCent(sousTotalAvantTaxes * PARAMS_DEFAUT.tvq) : 0;
  const total = auCent(sousTotalAvantTaxes + tps + tvq);

  return {
    lignes: lignesCalc,
    parIndex,
    totalCoutMateriaux: totalCoutMat,
    totalVenteMateriaux: totalVenteMat,
    totalHeuresInstallation: totalHeuresInstall,
    totalHeuresForfaitaires: totalHeuresForfait,
    totalHeures,
    totalCoutMO,
    sousTotalMateriauxMO: sousTotalMatMO,
    fraisGestionMontant,
    sousTotalAvantTaxes,
    tps,
    tvq,
    total,
  };
}

export function formatCAD(n: number): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export { FRAIS_FORFAITAIRES, TAUX_HORAIRE_VENTE };
