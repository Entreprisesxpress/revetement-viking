// Mappe une extraction Hover (mesures globales) vers les lignes de soumission
// en utilisant un préset comme template

import { PRESETS, type PresetMateriau } from "@/data/presets-soumission";
import { MATERIAUX } from "@/data/materiaux";
import type { LigneSoumission } from "@/lib/calculateur";
import { PARAMS_DEFAUT } from "@/data/main-oeuvre";

export interface HoverMesures {
  parement_total_pi2?: number | null;
  parement_net_pi2?: number | null;
  fascia_total_pi_lin?: number | null;
  soffite_total_pi2?: number | null;
  solin_total_pi_lin?: number | null;
  coins_exterieurs_pi_lin?: number | null;
  coins_interieurs_pi_lin?: number | null;
  moulure_j_pi_lin?: number | null;
  cadrage_fenetres_pi_lin?: number | null;
  nb_fenetres?: number | null;
  nb_portes?: number | null;
}

// Mappe par catégorie : pour chaque ligne du préset, on assigne la bonne mesure Hover
export function mapperHoverVersLignes(
  preset: PresetMateriau,
  mesures: HoverMesures
): LigneSoumission[] {
  return preset.lignes
    .map((pl) => {
      const mat = MATERIAUX.find((m) => m.code === pl.materiauCode);
      if (!mat) return null;

      let qty = pl.quantiteDefaut || 0;

      // Auto-assignation selon la catégorie
      switch (mat.categorie) {
        case "parement-vinyle":
        case "parement-aluminium":
        case "parement-composite":
          qty = mesures.parement_net_pi2 || mesures.parement_total_pi2 || 0;
          break;
        case "soffite":
          qty = mesures.soffite_total_pi2 || 0;
          break;
        case "fascia":
          qty = mesures.fascia_total_pi_lin || 0;
          break;
        case "solin":
          qty = mesures.solin_total_pi_lin || 0;
          break;
        case "depart":
          // Périmètre approximatif = on prend longueur fascia comme proxy
          qty = mesures.fascia_total_pi_lin || 0;
          break;
        case "accessoire":
          // Si le code suggère un type spécifique
          if (mat.nom.toLowerCase().includes("coin ext")) {
            qty = mesures.coins_exterieurs_pi_lin || 0;
          } else if (mat.nom.toLowerCase().includes("coin int")) {
            qty = mesures.coins_interieurs_pi_lin || 0;
          } else if (mat.nom.toLowerCase().includes("cadrage")) {
            qty = mesures.cadrage_fenetres_pi_lin || 0;
          } else if (mat.nom.toLowerCase().includes("j ") || mat.nom.toLowerCase().includes("moulure j") || mat.nom.toLowerCase().includes("j trim")) {
            qty = mesures.moulure_j_pi_lin || 0;
          } else if (mat.nom.toLowerCase().includes("égouttement") || mat.nom.toLowerCase().includes("egouttement")) {
            qty = mesures.fascia_total_pi_lin || 0;
          } else if (mat.uniteCalcul === "piece" && (mesures.parement_net_pi2 || 0) > 0) {
            // Sacs de vis : approx 1 sac par 100 pi² de parement
            qty = Math.ceil((mesures.parement_net_pi2 || 0) / 100);
          }
          break;
        case "rouleau":
          // 1 rouleau par 150 pi-lin de fascia (capping)
          if (mesures.fascia_total_pi_lin) {
            qty = Math.ceil(mesures.fascia_total_pi_lin / 150);
          }
          break;
      }

      return {
        materiauCode: pl.materiauCode,
        quantite: Math.round(qty * 10) / 10,
        surplus: mat.surplusDefaut,
        margePct: PARAMS_DEFAUT.margeMateriauxDefaut,
      };
    })
    .filter((l): l is LigneSoumission => l !== null);
}
