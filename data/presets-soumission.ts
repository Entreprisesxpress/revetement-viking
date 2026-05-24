// Présets de soumission - chaque préset = template de lignes typiques
// L'utilisateur clique sur un préset → les lignes sont auto-ajoutées avec quantités à 0
// Il n'a qu'à rentrer les mesures (ou laisser l'IA Hover le faire)

export interface PresetLigne {
  materiauCode: string;
  description?: string; // si on veut surcharger
  quantiteDefaut?: number;
}

export interface PresetMateriau {
  id: string;
  nom: string;
  icone: string;
  couleur: string;
  description: string;
  lignes: PresetLigne[];
}

export const PRESETS: PresetMateriau[] = [
  {
    id: "vinyle-complet",
    nom: "Vinyle - Complet",
    icone: "🏠",
    couleur: "bg-blue-100 border-blue-300 text-blue-900",
    description: "Parement vinyle Gentek + soffite/fascia/solin alu + accessoires",
    lignes: [
      { materiauCode: "64695" }, // Vinyle Fair Oaks D4 - parement
      { materiauCode: "1606" },  // Soffite alu 4 panneaux ventilé
      { materiauCode: "1696" },  // Fascia alu 6"
      { materiauCode: "2567" },  // Solin de toit
      { materiauCode: "65504" }, // Coin extérieur vinyle 3½"
      { materiauCode: "65520" }, // Coin intérieur vinyle
      { materiauCode: "65560" }, // Moulure J vinyle ½"
      { materiauCode: "65581" }, // Moulure d'égouttement
      { materiauCode: "65551" }, // Départ vinyle
    ],
  },
  {
    id: "maibec-bois",
    nom: "Maibec Bois",
    icone: "🌲",
    couleur: "bg-amber-100 border-amber-300 text-amber-900",
    description: "Maibec bois véritable haut de gamme + accessoires + soffite/fascia alu",
    lignes: [
      { materiauCode: "MAIBEC-BOIS-CLASSIQUE" },
      { materiauCode: "MAIBEC-COIN-EXT" },
      { materiauCode: "MAIBEC-MOULURE-J" },
      { materiauCode: "MAIBEC-MOULURE-DEPART" },
      { materiauCode: "MAIBEC-CADRAGE-FENETRE" },
      { materiauCode: "1606" },  // Soffite alu
      { materiauCode: "1696" },  // Fascia alu 6"
      { materiauCode: "2567" },  // Solin
    ],
  },
  {
    id: "maibec-canexel",
    nom: "Maibec Canexel",
    icone: "🌳",
    couleur: "bg-orange-100 border-orange-300 text-orange-900",
    description: "Maibec Canexel composite + accessoires + soffite/fascia alu",
    lignes: [
      { materiauCode: "MAIBEC-CANEXEL-RIDGEWOOD-6" },
      { materiauCode: "MAIBEC-COIN-EXT" },
      { materiauCode: "MAIBEC-MOULURE-J" },
      { materiauCode: "MAIBEC-MOULURE-DEPART" },
      { materiauCode: "MAIBEC-CADRAGE-FENETRE" },
      { materiauCode: "1606" },
      { materiauCode: "1696" },
      { materiauCode: "2567" },
    ],
  },
  {
    id: "mac-acier",
    nom: "MAC Acier",
    icone: "⚙️",
    couleur: "bg-slate-200 border-slate-400 text-slate-900",
    description: "Parement acier MAC MS1 + accessoires MAC + soffite/fascia alu",
    lignes: [
      { materiauCode: "R1G24" },     // MAC MS1 mural 24j
      { materiauCode: "M21A" },      // Coin ext avec J intégré MS1
      { materiauCode: "M22A" },      // Coin intérieur MS1
      { materiauCode: "M01A" },      // J Trim MS1
      { materiauCode: "M50A" },      // Solin angle droit MS1
      { materiauCode: "A058.250" },  // Vis K-LATCH 1.25"
      { materiauCode: "1606" },      // Soffite alu (souvent pas en acier)
      { materiauCode: "1696" },      // Fascia alu 6"
    ],
  },
  {
    id: "mac-harrywood",
    nom: "MAC Harrywood",
    icone: "🪵",
    couleur: "bg-stone-200 border-stone-400 text-stone-900",
    description: "MAC Harrywood (look bois acier) + accessoires + soffite/fascia",
    lignes: [
      { materiauCode: "SHWPG24" },   // Harrywood PLUS 24j
      { materiauCode: "M01C.10" },   // J Trim Harrywood (pqt 10)
      { materiauCode: "M20C.10" },   // Coin ext 2 pcs Harrywood (pqt 10)
      { materiauCode: "M22C.10" },   // Coin int QJ Harrywood (pqt 10)
      { materiauCode: "M50CD.10" },  // Solins Harrywood (pqt 10)
      { materiauCode: "M10SHW.10" }, // Moulure départ Harrywood
      { materiauCode: "A059.250" },  // Vis bois Harrywood
      { materiauCode: "1606" },
      { materiauCode: "1696" },
    ],
  },
  {
    id: "aluminium-complet",
    nom: "Aluminium",
    icone: "✨",
    couleur: "bg-zinc-200 border-zinc-400 text-zinc-900",
    description: "Parement aluminium Gentek + soffite/fascia/solin alu + accessoires",
    lignes: [
      { materiauCode: "1191" },      // Alu D4 régulier UNI
      { materiauCode: "2319" },      // Coin ext alu UNI
      { materiauCode: "1692" },      // Moulure J alu ½"
      { materiauCode: "1606" },      // Soffite alu ventilé
      { materiauCode: "1696" },      // Fascia alu 6"
      { materiauCode: "2567" },      // Solin de toit
      { materiauCode: "0109025" },   // Départ universel
      { materiauCode: "2543" },      // Moulure égouttement
    ],
  },
  {
    id: "reparation-soffite-fascia",
    nom: "Soffite/Fascia seulement",
    icone: "🔧",
    couleur: "bg-emerald-100 border-emerald-300 text-emerald-900",
    description: "Réparation/installation soffite + fascia + solin + capping",
    lignes: [
      { materiauCode: "1606" },      // Soffite alu ventilé
      { materiauCode: "1696" },      // Fascia alu 6"
      { materiauCode: "2567" },      // Solin
      { materiauCode: "2520" },      // J à soffite
      { materiauCode: "3037" },      // Rouleau capping
    ],
  },
];
