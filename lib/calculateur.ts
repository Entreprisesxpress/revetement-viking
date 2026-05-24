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

export function calculerSoumission(p: ParametresSoumission): SoumissionCalculee {
  const lignesCalc: LigneCalculee[] = [];
  let totalCoutMat = 0;
  let totalVenteMat = 0;
  let totalHeuresInstall = 0;

  for (const l of p.lignes) {
    const mat = MATERIAUX.find((m) => m.code === l.materiauCode);
    if (!mat) continue;

    const qtyAvecSurplus = l.quantite * (1 + l.surplus);
    const formatACommander = Math.ceil(qtyAvecSurplus / mat.qtyParFormat);

    // Coût réel = format à commander × prix par format (on commande des boîtes entières)
    const coutMat = formatACommander * mat.prixCoutantParFormat;
    const venteMat = coutMat * (1 + l.margePct);

    const rendement = RENDEMENT_HOMME_HEURE[mat.categorie] || 30;
    const heuresMO = qtyAvecSurplus / rendement;
    const coutMO = heuresMO * TAUX_HORAIRE_VENTE;

    const sousTotal = venteMat + coutMO;

    lignesCalc.push({
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
    } as any);

    totalCoutMat += coutMat;
    totalVenteMat += venteMat;
    totalHeuresInstall += heuresMO;
  }

  const totalHeuresForfait = p.fraisActifs.reduce((s, f) => s + f.heures, 0);
  const totalHeures = totalHeuresInstall + totalHeuresForfait;
  const totalCoutMO = totalHeures * TAUX_HORAIRE_VENTE;

  const sousTotalMatMO = totalVenteMat + totalCoutMO;
  const fraisGestionMontant = sousTotalMatMO * p.fraisGestion;
  const sousTotalAvantTaxes = sousTotalMatMO + fraisGestionMontant;

  const tps = p.appliquerTaxes ? sousTotalAvantTaxes * PARAMS_DEFAUT.tps : 0;
  const tvq = p.appliquerTaxes ? sousTotalAvantTaxes * PARAMS_DEFAUT.tvq : 0;
  const total = sousTotalAvantTaxes + tps + tvq;

  return {
    lignes: lignesCalc,
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

export { FRAIS_FORFAITAIRES };
